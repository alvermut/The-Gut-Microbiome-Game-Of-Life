import copy
import json
import subprocess
import unittest
from unittest.mock import patch

from receipt import escpos, render_receipt, validate, relative_abundances, qr_image, raster
from server import Printer


def sample(**changes):
    return dict(id='12345678-1234-4234-a234-123456789abc', rule='bacteria',
                participant='Albert',
                generation=360, duration=60, snapshots=12, counts=[120, 60, 20],
                leakyGut=False, antibiotics=1, probiotics=2, leakyToggles=2, **changes)


class ReceiptTests(unittest.TestCase):
    def test_counts_and_relative_abundance(self):
        text = render_receipt(sample())
        for label, fraction in [('Function A', '0.6000'), ('Function B', '0.3000'), ('Function C', '0.1000')]:
            self.assertIn(f'{label:<16}{fraction:>16}', text)
        self.assertIn(f"{'NICHE':<16}{'Adjusted CPMs':>16}", text)
        self.assertNotIn('COUNT', text)
        self.assertNotIn('REL ABUNDANCE', text)
        self.assertNotIn('Fractions of sampled bacteria', text)
        self.assertNotIn('%', text)

    def test_fraction_rounding_and_empty_counts(self):
        self.assertEqual(relative_abundances([1, 1, 1]), ['0.3334', '0.3333', '0.3333'])
        self.assertEqual(relative_abundances([0, 0]), ['N/A', 'N/A'])
        for counts in [[1, 2, 3, 4, 5], [0, 1, 0, 0, 0], [99, 11, 7]]:
            self.assertEqual(sum(round(float(n)*10000) for n in relative_abundances(counts)), 10000)

    def test_requested_wording_and_metadata_removed(self):
        text = render_receipt(sample())
        introduction = ('Game of Life shows how simple rules create complex patterns. '
                        'Different rules create different universes of the game '
                        '(Like Bacteria B3,4/S4,5,6). This universe adds a few rules '
                        'to depict the complexity of the gut microbiome. We often '
                        'focus on which microbes are there, but their jobs '
                        '(functional niches) may be more consistent and are linked '
                        'to our health. Complexity emerges, biology harnesses it.')
        self.assertIn(introduction, ' '.join(text.split()))
        for expected in ['Gut microbiome:', 'Game Of Life', 'Participant: Albert',
                         'TO KNOW MORE', 'https://conwaylife.com/wiki/', 'Thank you for playing',
                         'By: Albert Garcia-Valiente', 'The Microbiome Research Lab.']:
            self.assertIn(expected, text)
        for removed in ['TOTAL SAMPLED', 'Run:', 'Time:', 'Gen:', 'Clearance snapshots:',
                        'All 8 neighbors', 'AN ABSTRACT MICROBIOME MODEL', 'SHARE']:
            self.assertNotIn(removed, text)
        self.assertNotIn('Press SEQUENCE', text)
        self.assertIn('Complexity emerges, biology harnesses it.', ' '.join(text.split()))
        self.assertIn('Different rules create different universes', ' '.join(text.split()))
        self.assertIn('depict the complexity of the gut microbiome.', ' '.join(text.split()))
        self.assertIn('consumed and becomes a microbe with the same function', ' '.join(text.split()))
        self.assertIn('This universe adds', ' '.join(text.split()))
        self.assertIn('(Like Bacteria B3,4/S4,5,6)', ' '.join(text.split()))
        self.assertIn('towards the edge. Except when leaky gut', ' '.join(text.split()))
        self.assertIn('Mucus layer:', text)
        self.assertIn('Competition: types share space.', ' '.join(text.split()))
        self.assertIn('After each generation, a nutrient', ' '.join(text.split()))
        self.assertNotIn('After each update', text)
        self.assertNotIn('outer 10 squares', text)
        self.assertNotIn('central microbes', text.lower())

    def test_fits_32_columns_and_ascii_for_both_rules(self):
        for rule in ['conway', 'bacteria']:
            data = sample()
            data.update(rule=rule, counts=[1, 2, 3, 4, 5])
            text = render_receipt(data)
            text.encode('ascii')
            self.assertLessEqual(max(map(len, text.splitlines())), 32)

    def test_correct_preset_and_short_core_rules(self):
        text = render_receipt(sample())
        self.assertIn('We sequenced and profiled your gut microbiome', ' '.join(text.split()))
        self.assertNotIn('Here is your gut sampling', text)
        self.assertNotIn('B34/S456', text)
        self.assertIn('* Birth: 3,4 neighbors.', text)
        self.assertIn('* Base survival: 4,5,6', text)
        self.assertIn('CORE RULES (Bacteria)', text)
        data = sample(); data['rule'] = 'conway'
        text = render_receipt(data)
        self.assertIn('CORE RULES (Conway)', text)
        self.assertNotIn('B3/S23', text)
        self.assertIn('* Birth: 3 neighbors.', text)
        self.assertIn('* Base survival: 2,3', text)
        for rule in ['conway', 'bacteria']:
            data['rule'] = rule
            text = render_receipt(data)
            self.assertEqual(sum(line.startswith('* ') for line in text.splitlines()), 6)
            self.assertLessEqual(len(text.splitlines()), 80)
            for excluded in ['probiotic', 'antibiotic', 'interventions']:
                self.assertNotIn(excluded, text.lower())
            rules = text.split(f'CORE RULES ({rule.title()})\n')[1].split('=' * 32)[0]
            self.assertNotIn('SUMMARY', rules)
            self.assertNotIn('SUMMARY', text)
            self.assertIn('different universes of the game', ' '.join(text.split()))
            self.assertIn('functional niches', ' '.join(text.split()))
            self.assertIn('linked to our health', ' '.join(text.split()))

    def test_empty_abundance_unavailable(self):
        data = sample(); data['counts'] = [0, 0, 0]
        text = render_receipt(data)
        self.assertEqual(text.count('N/A'), 3)
        self.assertIn('Values unavailable.', text)
        self.assertNotIn('0.0%', text)

    def test_test_receipt_label(self):
        self.assertIn('TEST RECEIPT / SYNTHETIC DATA', render_receipt(sample(test=True)))

    def test_manual_samples_do_not_follow_generation_number(self):
        data = sample()
        data['snapshots'] = 0
        data['counts'] = [0, 0, 0]
        self.assertIn('N/A', render_receipt(data))
        data['snapshots'] = 1
        data['counts'] = [2821, 0, 0]
        self.assertIn('1.0000', render_receipt(data))
        data['counts'] = [2822, 0, 0]
        with self.assertRaises(ValueError):
            validate(data)

    def test_does_not_mutate_input(self):
        data = sample(); before = copy.deepcopy(data)
        render_receipt(data)
        self.assertEqual(data, before)

    def test_rejects_invalid_input_and_control_characters(self):
        for key, value in [('id', '\x1b@'), ('counts', [-1, 2]), ('counts', [True, 2]),
                           ('counts', [1]), ('counts', [999999, 2]), ('rule', 'unknown'),
                           ('rule', []), ('generation', 360.5), ('snapshots', -1),
                           ('leakyGut', 'true'), ('duration', -1), ('test', 'yes'),
                           ('participant', ''), ('participant', ' '), ('participant', 'A'*61),
                           ('participant', 'Name\nInjected'), ('participant', '\x1b@'),
                           ('participant', 'Name\u202e'), ('participant', None),
                           ('counts', [16000, 0])]:
            with self.subTest(key=key, value=value):
                data = sample(); data[key] = value
                with self.assertRaises(ValueError):
                    validate(data)
        for value in [None, [], 42]:
            with self.assertRaises(ValueError):
                validate(value)

    def test_escpos_has_no_drawer_or_cutter(self):
        output = escpos(render_receipt(sample()))
        self.assertTrue(output.startswith(b'\x1b@        Gut microbiome:'))
        self.assertTrue(output.endswith(b'\r\n\r\n\r\n'))
        self.assertNotIn(b'\n', output.replace(b'\r\n', b''))
        self.assertNotIn(b'\x1bM', output)
        self.assertNotIn(b'\x1ba', output)
        self.assertNotIn(b'\x1bp', output)
        self.assertNotIn(b'\x1dV', output)

    def test_escpos_matches_successful_printer_diagnostic(self):
        self.assertEqual(escpos('TEXT TEST 123 ABC\n'), b'\x1b@TEXT TEST 123 ABC\r\n\r\n\r\n')

    def test_competition_rule_reaches_printable_output(self):
        output = escpos(render_receipt(sample()), include_qr=True)
        self.assertIn(b'* Competition: types share space.', output.replace(b'\r\n  ', b' '))

    def test_qr_raster_included_after_receipt(self):
        text = render_receipt(sample())
        image = qr_image()
        self.assertEqual(image.size, (384, 224))
        encoded = raster(image)
        self.assertEqual(encoded[:8], b'\x1dv0\x00\x30\x00\xe0\x00')
        self.assertEqual(len(encoded), 8+48*224)
        self.assertTrue(escpos(text, include_qr=True).endswith(encoded+b'\r\n\r\n'))
        self.assertEqual(image.getpixel((0, 0)), 255)
        self.assertLess(image.getextrema()[0], 128)

    def test_accented_name_is_preserved_and_rasterized(self):
        data = sample();data['participant'] = 'María Muñoz'
        text = render_receipt(data)
        self.assertIn('Participant: María Muñoz', text)
        self.assertIn(b'\x1dv0\x00', escpos(text))
        self.assertNotIn(b'Mar?a', escpos(text))


class PrinterTests(unittest.TestCase):
    @patch('server.subprocess.run')
    def test_direct_queue_and_duplicate_prevention(self, run):
        run.return_value = subprocess.CompletedProcess([], 0, b'request id is Iggual_TP_Easy_58-12', b'')
        printer = Printer('Iggual_TP_Easy_58')
        result = printer.submit(sample())
        self.assertTrue(result['queued'])
        self.assertEqual(printer.submit(sample()), result)
        self.assertEqual(run.call_count, 1)
        args = run.call_args.args[0]
        self.assertEqual(args[:3], ['lp', '-d', 'Iggual_TP_Easy_58'])
        self.assertIn('raw', args)
        self.assertIn('job-sheets=none', args)
        self.assertNotIn('shell', run.call_args.kwargs)
        self.assertIn(b'0.6000', run.call_args.kwargs['input'])
        self.assertIn(raster(qr_image()), run.call_args.kwargs['input'])

    @patch('server.subprocess.run')
    def test_conflicting_id_rejected(self, run):
        run.return_value = subprocess.CompletedProcess([], 0, b'queued', b'')
        printer = Printer('Iggual_TP_Easy_58'); printer.submit(sample())
        data = sample(); data['counts'][0] += 1
        with self.assertRaisesRegex(Exception, 'different results'):
            printer.submit(data)
        self.assertEqual(run.call_count, 1)

    @patch('server.subprocess.run')
    def test_printer_error_is_not_success(self, run):
        run.return_value = subprocess.CompletedProcess([], 1, b'', b'Unknown printer')
        printer = Printer('Iggual_TP_Easy_58')
        with self.assertRaisesRegex(Exception, 'Unknown printer'):
            printer.submit(sample())
        self.assertFalse(printer.jobs)

    @patch('server.subprocess.run', side_effect=subprocess.TimeoutExpired('lp', 15))
    def test_timeout_cannot_duplicate_submission(self, run):
        printer = Printer('Iggual_TP_Easy_58')
        for _ in range(2):
            with self.assertRaisesRegex(Exception, 'may already be queued'):
                printer.submit(sample())
        self.assertEqual(run.call_count, 1)

    @patch('server.subprocess.run', side_effect=FileNotFoundError)
    def test_missing_cups(self, run):
        with self.assertRaisesRegex(Exception, 'CUPS lp is missing'):
            Printer('Iggual_TP_Easy_58').submit(sample())

    def test_invalid_queue(self):
        for queue in ['-d', 'printer; echo', 'queue\nother']:
            with self.assertRaises(ValueError):
                Printer(queue)


if __name__ == '__main__':
    unittest.main()

import 'package:flutter_test/flutter_test.dart';
import 'package:restropro_staff/strings.dart';

void main() {
  test('rs formats paise as rupees', () {
    expect(rs(16000), '₹160');
    expect(rs(16050), '₹160.50');
    expect(rs(5), '₹0.05');
  });
  test('t falls back to key when unknown', () {
    expect(t('does_not_exist'), 'does_not_exist');
  });
  test('Hindi is default, English available', () {
    expect(t('orders'), 'ऑर्डर');
    Lang.code.value = 'en';
    expect(t('orders'), 'Orders');
    Lang.code.value = 'hi';
  });
}

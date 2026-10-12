import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'strings.dart';
import 'widgets.dart';

/// Creates (or opens) the GST bill for a served order and shows it. Bill numbers and tax maths are done in the database.
Future<void> showBill(BuildContext context, String orderId) async {
  Map<String, dynamic> bill;
  List<Map<String, dynamic>> items;
  String restaurant = '';
  String table = '';
  try {
    final billId = await db.rpc('create_bill', params: {'p_order_id': orderId});
    bill = Map<String, dynamic>.from(await db.from('bills').select().eq('id', billId as String).single());
    final order = await db
        .from('orders')
        .select('table_no, restaurants(name), order_items(qty, unit_price_paise, menu_items(name))')
        .eq('id', orderId)
        .single();
    table = '${order['table_no']}';
    final r = order['restaurants'];
    restaurant = r is Map ? '${r['name']}' : '';
    items = List<Map<String, dynamic>>.from(order['order_items'] ?? []);
  } catch (e) {
    if (context.mounted) snack(context, friendlyError(e));
    return;
  }
  if (!context.mounted) return;

  final scheme = bill['gst_scheme'] as String;
  final half = scheme == 'regular_5' ? '2.5%' : (scheme == 'specified_18' ? '9%' : '');
  final gst = scheme != 'composition';

  final lines = <String>[
    restaurant,
    '${t('bill')} #${bill['bill_no']}   ${t('table')} $table',
    '------------------------',
    for (final i in items)
      '${i['menu_items']?['name'] ?? '?'} x${i['qty']}  ${rs((i['qty'] as int) * (i['unit_price_paise'] as int))}',
    '------------------------',
    '${t('subtotal')}: ${rs(bill['subtotal_paise'] as int)}',
    if (gst) 'CGST $half: ${rs(bill['cgst_paise'] as int)}',
    if (gst) 'SGST $half: ${rs(bill['sgst_paise'] as int)}',
    if (!gst) t('no_gst'),
    '${t('total')}: ${rs(bill['total_paise'] as int)}',
  ];
  final text = lines.join('\n');

  await showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text('${t('bill')} #${bill['bill_no']}'),
      content: SingleChildScrollView(child: SelectableText(text, style: const TextStyle(fontFamily: 'monospace', fontSize: 15))),
      actions: [
        TextButton(
          onPressed: () async {
            await Clipboard.setData(ClipboardData(text: text));
            if (ctx.mounted) snack(ctx, t('copied'));
          },
          child: Text(t('copy_bill')),
        ),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(100, 44)),
          onPressed: () => Navigator.pop(ctx),
          child: Text(t('close')),
        ),
      ],
    ),
  );
}

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Tiny 3-language helper (Hindi / Marathi / English). Default: Hindi.
class Lang {
  static final ValueNotifier<String> code = ValueNotifier<String>('hi');

  static Future<void> load() async {
    try {
      final p = await SharedPreferences.getInstance();
      code.value = p.getString('lang') ?? 'hi';
    } catch (_) {}
  }

  static Future<void> set(String c) async {
    code.value = c;
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString('lang', c);
    } catch (_) {}
  }
}

String t(String key) {
  final m = _s[key];
  if (m == null) return key;
  return m[Lang.code.value] ?? m['en'] ?? key;
}

String rs(int paise) {
  final whole = paise ~/ 100;
  final frac = paise % 100;
  return frac == 0 ? '₹$whole' : '₹$whole.${frac.toString().padLeft(2, '0')}';
}

const Map<String, Map<String, String>> _s = {
  'orders': {'en': 'Orders', 'hi': 'ऑर्डर', 'mr': 'ऑर्डर'},
  'new_order': {'en': 'New order', 'hi': 'नया ऑर्डर', 'mr': 'नवीन ऑर्डर'},
  'menu': {'en': 'Menu', 'hi': 'मेन्यू', 'mr': 'मेनू'},
  'login': {'en': 'Login', 'hi': 'लॉगिन', 'mr': 'लॉगिन'},
  'staff_login': {'en': 'Staff login', 'hi': 'स्टाफ लॉगिन', 'mr': 'स्टाफ लॉगिन'},
  'email': {'en': 'Email', 'hi': 'ईमेल', 'mr': 'ईमेल'},
  'password': {'en': 'Password', 'hi': 'पासवर्ड', 'mr': 'पासवर्ड'},
  'logout': {'en': 'Logout', 'hi': 'लॉगआउट', 'mr': 'लॉगआउट'},
  'wait': {'en': 'Please wait...', 'hi': 'रुकिए...', 'mr': 'थांबा...'},
  'bad_login': {'en': 'Wrong email or password', 'hi': 'ईमेल या पासवर्ड गलत है', 'mr': 'ईमेल किंवा पासवर्ड चुकीचा आहे'},
  'check_net': {'en': 'Check your internet and try again', 'hi': 'इंटरनेट देखकर फिर कोशिश करें', 'mr': 'इंटरनेट तपासून पुन्हा प्रयत्न करा'},
  'no_restaurant': {'en': 'This account is not linked to a restaurant. Ask the owner.', 'hi': 'यह अकाउंट किसी रेस्टोरेंट से जुड़ा नहीं है। ओनर से कहें।', 'mr': 'हे अकाउंट कोणत्याही रेस्टॉरंटशी जोडलेले नाही. मालकांना सांगा.'},
  'retry': {'en': 'Retry', 'hi': 'फिर कोशिश करें', 'mr': 'पुन्हा प्रयत्न करा'},
  'sec_pending': {'en': 'New (needs approval)', 'hi': 'नए (अप्रूव करने हैं)', 'mr': 'नवीन (मंजूर करायचे)'},
  'sec_approved': {'en': 'Approved', 'hi': 'अप्रूव्ड', 'mr': 'मंजूर'},
  'sec_preparing': {'en': 'Cooking', 'hi': 'बन रहा है', 'mr': 'तयार होत आहे'},
  'sec_ready': {'en': 'Ready - serve', 'hi': 'तैयार - सर्व करें', 'mr': 'तयार - सर्व्ह करा'},
  'sec_served': {'en': 'Served today (bill)', 'hi': 'आज सर्व हुए (बिल)', 'mr': 'आज सर्व्ह झाले (बिल)'},
  'no_orders': {'en': 'No orders right now', 'hi': 'अभी कोई ऑर्डर नहीं', 'mr': 'सध्या ऑर्डर नाही'},
  'act_approve': {'en': 'Approve', 'hi': 'अप्रूव करो', 'mr': 'मंजूर करा'},
  'act_start': {'en': 'Start cooking', 'hi': 'बनाना शुरू', 'mr': 'बनवणे सुरू'},
  'act_ready': {'en': 'Ready', 'hi': 'तैयार है', 'mr': 'तयार आहे'},
  'act_served': {'en': 'Served', 'hi': 'सर्व हो गया', 'mr': 'सर्व्ह झाले'},
  'act_bill': {'en': 'Make bill', 'hi': 'बिल बनाओ', 'mr': 'बिल करा'},
  'act_cancel': {'en': 'Cancel order', 'hi': 'ऑर्डर रद्द करो', 'mr': 'ऑर्डर रद्द करा'},
  'cancel_reason': {'en': 'Reason for cancelling', 'hi': 'रद्द करने का कारण', 'mr': 'रद्द करण्याचे कारण'},
  'reason_needed': {'en': 'Reason is required', 'hi': 'कारण लिखना ज़रूरी है', 'mr': 'कारण लिहिणे आवश्यक आहे'},
  'back': {'en': 'Back', 'hi': 'वापस', 'mr': 'मागे'},
  'table': {'en': 'Table', 'hi': 'टेबल', 'mr': 'टेबल'},
  'table_no': {'en': 'Table number', 'hi': 'टेबल नंबर', 'mr': 'टेबल क्रमांक'},
  'send_order': {'en': 'Send order', 'hi': 'ऑर्डर भेजो', 'mr': 'ऑर्डर पाठवा'},
  'order_sent': {'en': 'Order sent to kitchen', 'hi': 'ऑर्डर किचन को भेज दिया', 'mr': 'ऑर्डर किचनला पाठवला'},
  'saved_offline': {'en': 'No internet: order saved, will send automatically', 'hi': 'इंटरनेट नहीं: ऑर्डर सेव है, अपने आप चला जाएगा', 'mr': 'इंटरनेट नाही: ऑर्डर सेव्ह, आपोआप जाईल'},
  'pending_queue': {'en': 'waiting to send', 'hi': 'भेजना बाकी', 'mr': 'पाठवायचे बाकी'},
  'item_gone': {'en': 'An item just ran out. Refresh the menu.', 'hi': 'कोई आइटम अभी खत्म हो गया। मेन्यू रिफ्रेश करें।', 'mr': 'एखादा आयटम संपला. मेनू रिफ्रेश करा.'},
  'need_table': {'en': 'Enter table number', 'hi': 'टेबल नंबर डालें', 'mr': 'टेबल क्रमांक टाका'},
  'need_items': {'en': 'Add at least one item', 'hi': 'कम से कम एक आइटम जोड़ें', 'mr': 'किमान एक आयटम जोडा'},
  'sold_out': {'en': 'Sold out', 'hi': 'खत्म', 'mr': 'संपले'},
  'search': {'en': 'Search dish', 'hi': 'डिश खोजें', 'mr': 'डिश शोधा'},
  'add_item': {'en': 'Add item', 'hi': 'आइटम जोड़ें', 'mr': 'आयटम जोडा'},
  'edit_item': {'en': 'Edit item', 'hi': 'आइटम बदलें', 'mr': 'आयटम बदला'},
  'name': {'en': 'Name', 'hi': 'नाम', 'mr': 'नाव'},
  'price_rs': {'en': 'Price (Rs)', 'hi': 'कीमत (रु)', 'mr': 'किंमत (रु)'},
  'save': {'en': 'Save', 'hi': 'सेव करो', 'mr': 'सेव्ह करा'},
  'cancel': {'en': 'Cancel', 'hi': 'रद्द', 'mr': 'रद्द'},
  'available': {'en': 'Available', 'hi': 'उपलब्ध', 'mr': 'उपलब्ध'},
  'bill': {'en': 'Bill', 'hi': 'बिल', 'mr': 'बिल'},
  'subtotal': {'en': 'Subtotal', 'hi': 'सबटोटल', 'mr': 'सबटोटल'},
  'total': {'en': 'Total', 'hi': 'कुल', 'mr': 'एकूण'},
  'no_gst': {'en': 'Bill of Supply (no GST)', 'hi': 'बिल ऑफ सप्लाई (GST नहीं)', 'mr': 'बिल ऑफ सप्लाय (GST नाही)'},
  'copy_bill': {'en': 'Copy for WhatsApp', 'hi': 'WhatsApp के लिए कॉपी', 'mr': 'WhatsApp साठी कॉपी'},
  'copied': {'en': 'Copied', 'hi': 'कॉपी हो गया', 'mr': 'कॉपी झाले'},
  'close': {'en': 'Close', 'hi': 'बंद', 'mr': 'बंद'},
  'failed': {'en': 'Could not do it. Try again.', 'hi': 'नहीं हो पाया, फिर कोशिश करें', 'mr': 'झाले नाही, पुन्हा प्रयत्न करा'},
  'not_allowed': {'en': 'You are not allowed to do this', 'hi': 'आपको इसकी अनुमति नहीं है', 'mr': 'तुम्हाला याची परवानगी नाही'},
  'language': {'en': 'Language', 'hi': 'भाषा', 'mr': 'भाषा'},
};

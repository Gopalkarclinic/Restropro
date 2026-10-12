import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'strings.dart';

final db = Supabase.instance.client;

class LanguageButton extends StatelessWidget {
  final bool dark;
  const LanguageButton({super.key, this.dark = false});

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      tooltip: t('language'),
      icon: Icon(Icons.translate, color: dark ? const Color(0xFF6B1E1E) : Colors.white),
      onSelected: Lang.set,
      itemBuilder: (_) => const [
        PopupMenuItem(value: 'hi', child: Text('हिन्दी')),
        PopupMenuItem(value: 'mr', child: Text('मराठी')),
        PopupMenuItem(value: 'en', child: Text('English')),
      ],
    );
  }
}

/// Keeps content readable on big screens (laptop) and full-width on phones.
class Centered extends StatelessWidget {
  final Widget child;
  final double maxWidth;
  const Centered({super.key, required this.child, this.maxWidth = 1100});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(constraints: BoxConstraints(maxWidth: maxWidth), child: child),
    );
  }
}

void snack(BuildContext context, String msg) {
  if (!context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
}

/// True when the error is a rule from our database (not a network problem).
bool isBusinessError(Object e) {
  if (e is PostgrestException) {
    final c = e.code ?? '';
    return c == 'P0001' || c == '42501' || c == '22P02' || c == '23514' || c == '23503';
  }
  return false;
}

String friendlyError(Object e) {
  final m = e is PostgrestException ? e.message : e.toString();
  if (m.contains('item_unavailable')) return t('item_gone');
  if (m.contains('cancel_reason_required')) return t('reason_needed');
  if (m.contains('transition_not_allowed') || m.contains('not_allowed')) return t('not_allowed');
  return t('failed');
}

void alertNewOrder() {
  SystemSound.play(SystemSoundType.alert);
  HapticFeedback.heavyImpact();
}

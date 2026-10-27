import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'data/app_translations.dart';

final appLocaleNotifier = ValueNotifier<String>('en');

String appT(String key) {
  final lang = appLocaleNotifier.value;
  return kTranslations[lang]?[key] ?? kTranslations['en']?[key] ?? key;
}

Future<void> initLocale() async {
  final prefs = await SharedPreferences.getInstance();
  final saved = prefs.getString('prima_language') ?? 'en';
  final supported = kSupportedLanguages.map((l) => l.code).toSet();
  appLocaleNotifier.value = supported.contains(saved) ? saved : 'en';
}

Future<void> setAppLocale(String code, {String? userId, dynamic supabaseClient}) async {
  appLocaleNotifier.value = code;
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString('prima_language', code);
  if (userId != null && supabaseClient != null) {
    try {
      await supabaseClient.from('users').update({'language': code}).eq('id', userId);
    } catch (_) {}
  }
}

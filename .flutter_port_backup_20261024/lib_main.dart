import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'config.dart';
import 'locale.dart';
import 'router.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Supabase.initialize(
    url: AppConfig.supabaseUrl,
    anonKey: AppConfig.supabaseAnonKey, // ignore: deprecated_member_use
  );
  await initLocale();

  runApp(const PrimaApp());
}

final supabase = Supabase.instance.client;
final mapFocusNotifier = ValueNotifier<Map<String, dynamic>?>(null);

void primaSnack(BuildContext context, String msg, {bool isError = false, bool isSuccess = false}) {
  if (!context.mounted) return;
  final gradient = isError
      ? const LinearGradient(colors: [Color(0xFFFF3366), Color(0xFFFF6B6B)])
      : isSuccess
          ? const LinearGradient(colors: [Color(0xFF00C48C), Color(0xFF00D4A0)])
          : const LinearGradient(colors: [Color(0xFF6C47FF), Color(0xFF9B59FF)]);
  final icon = isError
      ? Icons.error_outline_rounded
      : isSuccess
          ? Icons.check_circle_outline_rounded
          : Icons.info_outline_rounded;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          gradient: gradient,
          borderRadius: BorderRadius.circular(12),
          boxShadow: const [BoxShadow(color: Color(0x336C47FF), blurRadius: 16, offset: Offset(0, 4))],
        ),
        child: Row(children: [
          Icon(icon, color: Colors.white, size: 18),
          const SizedBox(width: 10),
          Expanded(child: Text(msg, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 13))),
        ]),
      ),
      backgroundColor: Colors.transparent,
      behavior: SnackBarBehavior.floating,
      elevation: 0,
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 20),
      padding: EdgeInsets.zero,
      duration: const Duration(seconds: 3),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ));
}

class PrimaApp extends StatefulWidget {
  const PrimaApp({super.key});
  @override
  State<PrimaApp> createState() => _PrimaAppState();
}

class _PrimaAppState extends State<PrimaApp> {
  @override
  void initState() {
    super.initState();
    appLocaleNotifier.addListener(_onLocale);
  }

  @override
  void dispose() {
    appLocaleNotifier.removeListener(_onLocale);
    super.dispose();
  }

  void _onLocale() => setState(() {});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      locale: Locale(appLocaleNotifier.value),
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [
        Locale('en'), Locale('fr'), Locale('es'), Locale('pt'),
        Locale('ar'), Locale('zh'), Locale('hi'), Locale('de'),
      ],
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF6C47FF),
          brightness: Brightness.light,
          primary: const Color(0xFF6C47FF),
          onPrimary: Colors.white,
          secondary: const Color(0xFF00C48C),
          onSecondary: Colors.white,
          surface: const Color(0xFFF8F7FF),
          onSurface: const Color(0xFF14123A),
        ),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFF8F7FF),
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.white,
          elevation: 0,
          scrolledUnderElevation: 0,
          iconTheme: IconThemeData(color: Color(0xFF6C47FF)),
          actionsIconTheme: IconThemeData(color: Color(0xFF6C47FF)),
        ),
        floatingActionButtonTheme: const FloatingActionButtonThemeData(
          backgroundColor: Color(0xFF6C47FF),
          foregroundColor: Colors.white,
        ),
        progressIndicatorTheme: const ProgressIndicatorThemeData(
          color: Color(0xFF6C47FF),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFF6C47FF),
            foregroundColor: Colors.white,
          ),
        ),
        dividerTheme: const DividerThemeData(color: Color(0xFFE2E0FF)),
        cardTheme: const CardThemeData(color: Colors.white),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: Colors.white,
          elevation: 0,
          indicatorColor: const Color(0xFF6C47FF).withValues(alpha: 0.12),
          iconTheme: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.selected)) {
              return const IconThemeData(color: Color(0xFF6C47FF));
            }
            return const IconThemeData(color: Color(0xFF8B8FAF));
          }),
          labelTextStyle: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.selected)) {
              return const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF6C47FF));
            }
            return const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFF8B8FAF));
          }),
        ),
      ),
      routerConfig: router,
    );
  }
}


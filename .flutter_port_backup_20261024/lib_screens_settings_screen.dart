import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import '../main.dart';
import '../locale.dart';
import '../widgets/brand_icon.dart';
import '../widgets/prima_loader.dart';
import '../data/app_translations.dart';

const _purple = Color(0xFF6C47FF);
const _dark   = Color(0xFF14123A);
const _muted  = Color(0xFF8B8FAF);
const _border = Color(0xFFE2E0FF);
const _bg     = Color(0xFFF8F7FF);

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool   _loading        = true;
  bool   _saving         = false;
  bool   _saved          = false;
  double _credits        = 0;
  double _lifetimeEarned = 0;
  String _currency       = 'USD';

  final Map<String, bool> _notif = {
    'applications': true, 'messages': true, 'receipts': true,
    'reviews': true, 'newGigs': true, 'sounds': true,
  };
  final Map<String, bool> _priv = {
    'location': true, 'phone': true, 'profile': true,
  };

  @override
  void initState() {
    super.initState();
    appLocaleNotifier.addListener(_onLocale);
    _load();
  }

  @override
  void dispose() {
    appLocaleNotifier.removeListener(_onLocale);
    super.dispose();
  }

  void _onLocale() { if (mounted) setState(() {}); }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    for (final k in _notif.keys.toList()) {
      _notif[k] = prefs.getBool('notif_$k') ?? true;
    }
    for (final k in _priv.keys.toList()) {
      _priv[k] = prefs.getBool('priv_$k') ?? true;
    }
    _currency = prefs.getString('prima_currency') ?? 'USD';
    final uid = supabase.auth.currentUser?.id;
    if (uid != null) {
      try {
        final p = await supabase
            .from('users')
            .select('prima_credits, lifetime_earned')
            .eq('id', uid)
            .single();
        _credits        = ((p['prima_credits']   as num?) ?? 0).toDouble();
        _lifetimeEarned = ((p['lifetime_earned'] as num?) ?? 0).toDouble();
      } catch (_) {}
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final prefs = await SharedPreferences.getInstance();
    for (final e in _notif.entries) {
      await prefs.setBool('notif_${e.key}', e.value);
    }
    for (final e in _priv.entries) {
      await prefs.setBool('priv_${e.key}', e.value);
    }
    await prefs.setString('prima_currency', _currency);
    final uid = supabase.auth.currentUser?.id;
    if (uid != null) {
      try {
        await supabase.from('users').update({'preferred_currency': _currency}).eq('id', uid);
      } catch (_) {}
    }
    await Future.delayed(const Duration(milliseconds: 500));
    if (mounted) {
      setState(() { _saving = false; _saved = true; });
      primaSnack(context, appT('saveSettings'), isSuccess: true);
    }
    await Future.delayed(const Duration(seconds: 2));
    if (mounted) setState(() => _saved = false);
  }

  Future<void> _signOut() async {
    await supabase.auth.signOut();
    if (mounted) context.go('/auth');
  }

  void _toggleNotif(String key) => setState(() => _notif[key] = !(_notif[key]!));
  void _togglePriv(String key)  => setState(() => _priv[key]  = !(_priv[key]!));

  Future<void> _pickLanguage() async {
    await showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _LangSheet(current: appLocaleNotifier.value),
    );
  }

  Future<void> _pickCurrency() async {
    final picked = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _CurrencySheet(current: _currency),
    );
    if (picked != null && mounted) setState(() => _currency = picked);
  }

  @override
  Widget build(BuildContext context) {
    final email = supabase.auth.currentUser?.email ?? '';

    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: _dark),
          onPressed: () => context.pop(),
        ),
        title: Text(appT('settings'), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: _dark)),
      ),
      body: _loading
          ? const Center(child: PrimaLoader())
          : SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                _CreditsCard(credits: _credits, lifetimeEarned: _lifetimeEarned),
                const SizedBox(height: 12),
                _SafetyCard(),
                const SizedBox(height: 12),
                _SectionCard(
                  label: appT('account'),
                  child: Row(children: [
                    Container(
                      width: 44, height: 44,
                      decoration: BoxDecoration(color: const Color(0xFFEEE9FF), borderRadius: BorderRadius.circular(12)),
                      alignment: Alignment.center,
                      child: Text(
                        email.isNotEmpty ? email[0].toUpperCase() : '?',
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: _purple),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(email, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _dark)),
                      const SizedBox(height: 2),
                      const Text('Prima Member', style: TextStyle(fontSize: 11, color: _muted)),
                    ])),
                  ]),
                ),
                const SizedBox(height: 12),
                _SectionCard(
                  label: appT('notifications'),
                  child: Column(children: [
                    _ToggleRow(icon: 'applied',        label: appT('notifications_applications'), sub: appT('notifications_applications_sub'), value: _notif['applications']!, onToggle: () => _toggleNotif('applications')),
                    _ToggleRow(icon: 'chat',           label: appT('notifications_messages'),     sub: appT('notifications_messages_sub'),     value: _notif['messages']!,    onToggle: () => _toggleNotif('messages')),
                    _ToggleRow(icon: 'receipt',        label: appT('notifications_receipts'),     sub: appT('notifications_receipts_sub'),     value: _notif['receipts']!,    onToggle: () => _toggleNotif('receipts')),
                    _ToggleRow(icon: 'reviews',        label: appT('notifications_reviews'),      sub: appT('notifications_reviews_sub'),      value: _notif['reviews']!,     onToggle: () => _toggleNotif('reviews')),
                    _ToggleRow(icon: 'map',            label: appT('notifications_newGigs'),      sub: appT('notifications_newGigs_sub'),      value: _notif['newGigs']!,     onToggle: () => _toggleNotif('newGigs')),
                    _ToggleRow(icon: 'notifications',  label: appT('notifications_sounds'),       sub: appT('notifications_sounds_sub'),       value: _notif['sounds']!,      onToggle: () => _toggleNotif('sounds'), border: false),
                  ]),
                ),
                const SizedBox(height: 12),
                _SectionCard(
                  label: appT('privacy'),
                  child: Column(children: [
                    _ToggleRow(icon: 'location', label: appT('privacy_location'), sub: appT('privacy_location_sub'), value: _priv['location']!, onToggle: () => _togglePriv('location')),
                    _ToggleRow(icon: 'phone',    label: appT('privacy_phone'),    sub: appT('privacy_phone_sub'),    value: _priv['phone']!,    onToggle: () => _togglePriv('phone')),
                    _ToggleRow(icon: 'profile',  label: appT('privacy_profile'),  sub: appT('privacy_profile_sub'),  value: _priv['profile']!,  onToggle: () => _togglePriv('profile'), border: false),
                  ]),
                ),
                const SizedBox(height: 12),
                _LangCard(onTap: _pickLanguage, currency: _currency, onCurrencyTap: _pickCurrency),
                const SizedBox(height: 12),
                _SectionCard(
                  label: appT('legal'),
                  child: Column(children: [
                    _LegalRow(icon: '🔒', label: appT('privacyPolicy'), sub: appT('privacyPolicy_sub'), url: 'https://primaplug.com/privacy'),
                    _LegalRow(icon: '📄', label: appT('termsOfService'), sub: appT('termsOfService_sub'), url: 'https://primaplug.com/terms', border: false),
                  ]),
                ),
                const SizedBox(height: 16),
                GestureDetector(
                  onTap: _saving ? null : _save,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(vertical: 15),
                    decoration: BoxDecoration(
                      gradient: _saved
                          ? null
                          : _saving
                              ? null
                              : const LinearGradient(colors: [Color(0xFF6C47FF), Color(0xFF9B59FF)], begin: Alignment.topLeft, end: Alignment.bottomRight),
                      color: _saved ? const Color(0xFFDFFDF4) : _saving ? const Color(0xFFB8A5FF) : null,
                      borderRadius: BorderRadius.circular(14),
                      border: _saved ? Border.all(color: const Color(0xFF7EECD2), width: 1.5) : null,
                      boxShadow: _saved || _saving ? [] : const [BoxShadow(color: Color(0x506C47FF), blurRadius: 16, offset: Offset(0, 4))],
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      _saved ? '✓ ${appT('saveSettings')}!' : _saving ? '⏳ ...' : appT('saveSettings'),
                      style: TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w700,
                        color: _saved ? const Color(0xFF00C48C) : Colors.white,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                GestureDetector(
                  onTap: _signOut,
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 15),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFE8EE),
                      border: Border.all(color: const Color(0xFFFF99B3), width: 1.5),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    alignment: Alignment.center,
                    child: Text(appT('logOut'), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFFFF3366))),
                  ),
                ),
              ]),
            ),
    );
  }
}

// ─── Credits card ────────────────────────────────────────────────────────────

class _CreditsCard extends StatelessWidget {
  final double credits;
  final double lifetimeEarned;
  const _CreditsCard({required this.credits, required this.lifetimeEarned});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFF6C47FF), Color(0xFF9B59FF)], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [BoxShadow(color: Color(0x506C47FF), blurRadius: 20, offset: Offset(0, 6))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(appT('primaCredits'), style: const TextStyle(fontSize: 11, color: Colors.white70, letterSpacing: 0.8)),
              const SizedBox(height: 4),
              Text(
                credits.toStringAsFixed(0),
                style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: -1),
              ),
            ]),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(appT('lifetimeEarned'), style: const TextStyle(fontSize: 11, color: Colors.white70, letterSpacing: 0.8)),
            const SizedBox(height: 4),
            Text(
              lifetimeEarned.toStringAsFixed(0),
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: -0.5),
            ),
          ]),
        ]),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(child: _credBtn(context, appT('referEarn'), '/refer')),
          const SizedBox(width: 8),
          Expanded(child: _credBtn(context, appT('commission'), '/commission')),
        ]),
      ]),
    );
  }

  static Widget _credBtn(BuildContext ctx, String label, String route) {
    return GestureDetector(
      onTap: () => ctx.push(route),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 9),
        decoration: BoxDecoration(
          color: Colors.white24,
          border: Border.all(color: Colors.white30),
          borderRadius: BorderRadius.circular(10),
        ),
        alignment: Alignment.center,
        child: Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
      ),
    );
  }
}

// ─── Safety card ─────────────────────────────────────────────────────────────

class _SafetyCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFFE8EE),
        border: Border.all(color: const Color(0xFFFF99B3), width: 1.5),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(appT('safety'), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFFFF3366), letterSpacing: 1)),
        const SizedBox(height: 14),
        GestureDetector(
          onTap: () => _showEmergencyDialog(context),
          child: Row(children: [
            Container(
              width: 44, height: 44,
              decoration: BoxDecoration(color: const Color(0xFFFF3366), borderRadius: BorderRadius.circular(12)),
              alignment: Alignment.center,
              child: const Text('🆘', style: TextStyle(fontSize: 22)),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(appT('emergencyReport'), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFFFF3366))),
              const SizedBox(height: 2),
              Text(appT('emergencyReport_sub'), style: const TextStyle(fontSize: 11, color: Color(0xFFFF3366))),
            ])),
            const Icon(Icons.arrow_forward_ios_rounded, size: 14, color: Color(0xFFFF3366)),
          ]),
        ),
      ]),
    );
  }

  static void _showEmergencyDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('🆘 Emergency Report', style: TextStyle(fontWeight: FontWeight.w800)),
        content: const Text(
          'For immediate emergencies please call your local emergency number.\n\nTo report a serious incident on Prima, please contact us at safety@primaplug.com or use the in-app report feature on the user\'s profile.',
          style: TextStyle(fontSize: 13, height: 1.6),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('OK', style: TextStyle(color: Color(0xFF6C47FF), fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}

// ─── Section card ─────────────────────────────────────────────────────────────

class _SectionCard extends StatelessWidget {
  final String label;
  final Widget child;
  const _SectionCard({required this.label, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 4),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: _border, width: 1.5),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _muted, letterSpacing: 0.8)),
        const SizedBox(height: 4),
        child,
      ]),
    );
  }
}

// ─── Toggle row ───────────────────────────────────────────────────────────────

class _ToggleRow extends StatelessWidget {
  final String icon, label, sub;
  final bool value, border;
  final VoidCallback onToggle;
  const _ToggleRow({required this.icon, required this.label, required this.sub, required this.value, required this.onToggle, this.border = true});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: border ? const BoxDecoration(border: Border(bottom: BorderSide(color: Color(0xFFF5F4FF)))) : null,
      child: Row(children: [
        BrandIcon(name: icon, size: 34, active: value),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _dark)),
          const SizedBox(height: 1),
          Text(sub, style: const TextStyle(fontSize: 11, color: _muted)),
        ])),
        const SizedBox(width: 12),
        GestureDetector(
          onTap: onToggle,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            width: 44, height: 24,
            decoration: BoxDecoration(
              color: value ? _purple : _border,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Stack(children: [
              AnimatedPositioned(
                duration: const Duration(milliseconds: 200),
                top: 3, left: value ? 23 : 3,
                child: Container(
                  width: 18, height: 18,
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                    boxShadow: [BoxShadow(color: Colors.black26, blurRadius: 4, offset: Offset(0, 1))],
                  ),
                ),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}

// ─── Language card ────────────────────────────────────────────────────────────

class _LangCard extends StatelessWidget {
  final VoidCallback onTap;
  final String currency;
  final VoidCallback onCurrencyTap;
  const _LangCard({required this.onTap, required this.currency, required this.onCurrencyTap});

  @override
  Widget build(BuildContext context) {
    final meta = langMeta(appLocaleNotifier.value);
    final curr = kCurrencies.firstWhere((c) => c.code == currency, orElse: () => kCurrencies[0]);
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: _border, width: 1.5),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${appT('language')} & ${appT('currency')}'.toUpperCase(),
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _muted, letterSpacing: 0.8)),
        const SizedBox(height: 12),
        Row(children: [
          const Text('🌍', style: TextStyle(fontSize: 20)),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(appT('language'), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _dark)),
            const SizedBox(height: 1),
            Text(appT('langDisplay'), style: const TextStyle(fontSize: 11, color: _muted)),
          ])),
          GestureDetector(
            onTap: onTap,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFFF5F4FF),
                border: Border.all(color: _border, width: 1.5),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text(meta.flag, style: const TextStyle(fontSize: 18)),
                const SizedBox(width: 6),
                Text(meta.native, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _dark)),
                const SizedBox(width: 4),
                const Icon(Icons.keyboard_arrow_down_rounded, size: 16, color: _muted),
              ]),
            ),
          ),
        ]),
        const SizedBox(height: 12),
        Container(height: 1, color: const Color(0xFFF5F4FF)),
        const SizedBox(height: 12),
        Row(children: [
          const Text('💱', style: TextStyle(fontSize: 20)),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(appT('currency'), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _dark)),
            const SizedBox(height: 1),
            const Text('Default display currency', style: TextStyle(fontSize: 11, color: _muted)),
          ])),
          GestureDetector(
            onTap: onCurrencyTap,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFFF5F4FF),
                border: Border.all(color: _border, width: 1.5),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text(curr.flag, style: const TextStyle(fontSize: 18)),
                const SizedBox(width: 6),
                Text(curr.code, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _dark)),
                const SizedBox(width: 4),
                const Icon(Icons.keyboard_arrow_down_rounded, size: 16, color: _muted),
              ]),
            ),
          ),
        ]),
      ]),
    );
  }
}

// ─── Legal row ────────────────────────────────────────────────────────────────

class _LegalRow extends StatelessWidget {
  final String icon, label, sub, url;
  final bool border;
  const _LegalRow({required this.icon, required this.label, required this.sub, required this.url, this.border = true});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () async {
        final uri = Uri.parse(url);
        if (await canLaunchUrl(uri)) await launchUrl(uri, mode: LaunchMode.externalApplication);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 13),
        decoration: border ? const BoxDecoration(border: Border(bottom: BorderSide(color: Color(0xFFF5F4FF)))) : null,
        child: Row(children: [
          Container(
            width: 34, height: 34,
            decoration: BoxDecoration(color: const Color(0xFFF5F4FF), borderRadius: BorderRadius.circular(10)),
            alignment: Alignment.center,
            child: Text(icon, style: const TextStyle(fontSize: 16)),
          ),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _dark)),
            const SizedBox(height: 1),
            Text(sub, style: const TextStyle(fontSize: 11, color: _muted)),
          ])),
          const Icon(Icons.chevron_right_rounded, color: _muted, size: 20),
        ]),
      ),
    );
  }
}

// ─── Currency data ────────────────────────────────────────────────────────────

class CurrencyMeta {
  final String code, symbol, name, flag;
  const CurrencyMeta(this.code, this.symbol, this.name, this.flag);
}

const List<CurrencyMeta> kCurrencies = [
  CurrencyMeta('USD', '\$',   'US Dollar',          '🇺🇸'),
  CurrencyMeta('EUR', '€',   'Euro',               '🇪🇺'),
  CurrencyMeta('GBP', '£',   'British Pound',      '🇬🇧'),
  CurrencyMeta('JPY', '¥',   'Japanese Yen',       '🇯🇵'),
  CurrencyMeta('CNY', '¥',   'Chinese Yuan',       '🇨🇳'),
  CurrencyMeta('CAD', 'CA\$','Canadian Dollar',    '🇨🇦'),
  CurrencyMeta('AUD', 'A\$', 'Australian Dollar',  '🇦🇺'),
  CurrencyMeta('CHF', 'Fr',  'Swiss Franc',        '🇨🇭'),
  CurrencyMeta('NGN', '₦',   'Nigerian Naira',     '🇳🇬'),
  CurrencyMeta('ZAR', 'R',   'South African Rand', '🇿🇦'),
  CurrencyMeta('GHS', '₵',   'Ghanaian Cedi',      '🇬🇭'),
  CurrencyMeta('KES', 'KSh', 'Kenyan Shilling',    '🇰🇪'),
  CurrencyMeta('EGP', 'E£',  'Egyptian Pound',     '🇪🇬'),
  CurrencyMeta('AED', 'AED', 'UAE Dirham',         '🇦🇪'),
  CurrencyMeta('SAR', 'SAR', 'Saudi Riyal',        '🇸🇦'),
  CurrencyMeta('INR', '₹',   'Indian Rupee',       '🇮🇳'),
  CurrencyMeta('SGD', 'S\$', 'Singapore Dollar',   '🇸🇬'),
  CurrencyMeta('BRL', 'R\$', 'Brazilian Real',     '🇧🇷'),
  CurrencyMeta('MXN', 'MX\$','Mexican Peso',       '🇲🇽'),
  CurrencyMeta('TRY', '₺',   'Turkish Lira',       '🇹🇷'),
];

// ─── Language picker sheet ────────────────────────────────────────────────────

class _LangSheet extends StatefulWidget {
  final String current;
  const _LangSheet({required this.current});
  @override
  State<_LangSheet> createState() => _LangSheetState();
}

class _LangSheetState extends State<_LangSheet> {
  late String _selected;

  @override
  void initState() {
    super.initState();
    _selected = widget.current;
  }

  Future<void> _select(String code) async {
    setState(() => _selected = code);
    final uid = supabase.auth.currentUser?.id;
    await setAppLocale(code, userId: uid, supabaseClient: supabase);
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 36, height: 4,
          margin: const EdgeInsets.only(bottom: 20),
          decoration: BoxDecoration(color: _border, borderRadius: BorderRadius.circular(2)),
        ),
        Text(appT('chooseLanguage'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: _dark)),
        const SizedBox(height: 4),
        const Text('App display language', style: TextStyle(fontSize: 12, color: _muted)),
        const SizedBox(height: 16),
        ...kSupportedLanguages.map((lang) => GestureDetector(
          onTap: () => _select(lang.code),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            decoration: BoxDecoration(
              color: _selected == lang.code ? const Color(0xFFEEE9FF) : const Color(0xFFF8F7FF),
              border: Border.all(
                color: _selected == lang.code ? const Color(0xFFB8A5FF) : _border,
                width: 1.5,
              ),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(children: [
              Text(lang.flag, style: const TextStyle(fontSize: 22)),
              const SizedBox(width: 14),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(
                  lang.native,
                  style: TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w700,
                    color: _selected == lang.code ? _purple : _dark,
                  ),
                ),
                Text(lang.name, style: const TextStyle(fontSize: 11, color: _muted)),
              ])),
              if (_selected == lang.code)
                Container(
                  width: 24, height: 24,
                  decoration: const BoxDecoration(color: _purple, shape: BoxShape.circle),
                  child: const Icon(Icons.check_rounded, size: 14, color: Colors.white),
                ),
            ]),
          ),
        )),
      ]),
    );
  }
}

// ─── Currency picker sheet ────────────────────────────────────────────────────

class _CurrencySheet extends StatelessWidget {
  final String current;
  const _CurrencySheet({required this.current});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 36, height: 4,
          margin: const EdgeInsets.only(bottom: 20),
          decoration: BoxDecoration(color: _border, borderRadius: BorderRadius.circular(2)),
        ),
        Text(appT('chooseCurrency'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: _dark)),
        const SizedBox(height: 4),
        const Text('Default display currency', style: TextStyle(fontSize: 12, color: _muted)),
        const SizedBox(height: 16),
        SizedBox(
          height: 380,
          child: ListView.builder(
            itemCount: kCurrencies.length,
            itemBuilder: (ctx, i) {
              final curr = kCurrencies[i];
              final selected = curr.code == current;
              return GestureDetector(
                onTap: () => Navigator.pop(ctx, curr.code),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                  decoration: BoxDecoration(
                    color: selected ? const Color(0xFFEEE9FF) : const Color(0xFFF8F7FF),
                    border: Border.all(
                      color: selected ? const Color(0xFFB8A5FF) : _border,
                      width: 1.5,
                    ),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(children: [
                    Text(curr.flag, style: const TextStyle(fontSize: 22)),
                    const SizedBox(width: 14),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(
                        '${curr.code}  ${curr.name}',
                        style: TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w700,
                          color: selected ? _purple : _dark,
                        ),
                      ),
                      Text(curr.symbol, style: const TextStyle(fontSize: 11, color: _muted)),
                    ])),
                    if (selected)
                      Container(
                        width: 24, height: 24,
                        decoration: const BoxDecoration(color: _purple, shape: BoxShape.circle),
                        child: const Icon(Icons.check_rounded, size: 14, color: Colors.white),
                      ),
                  ]),
                ),
              );
            },
          ),
        ),
      ]),
    );
  }
}

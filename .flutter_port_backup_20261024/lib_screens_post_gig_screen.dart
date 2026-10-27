import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';

import '../main.dart';

// ─── Constants ────────────────────────────────────────────────────────────────

const _purple = Color(0xFF6C47FF);
const _green = Color(0xFF00C48C);
const _dark = Color(0xFF14123A);
const _muted = Color(0xFF8B8FAF);
const _inputBg = Color(0xFFF5F4FF);
const _border = Color(0xFFE2E0FF);

// ─── Category groups ──────────────────────────────────────────────────────────

class _CatGroup {
  final String group, icon;
  final Color color, bg, border;
  final List<String> fields;
  const _CatGroup(this.group, this.icon, this.color, this.bg, this.border, this.fields);
}

const _kCatGroups = <_CatGroup>[
  _CatGroup('Technology & Digital', '💻', Color(0xFF6C47FF), Color(0xFFEEE9FF), Color(0xFFB8A5FF), ['Software Development', 'Web Design & UI/UX', 'Mobile Apps', 'IT Support & Networks', 'Cybersecurity', 'Data & Analytics', 'AI & Automation', 'DevOps & Cloud', 'SEO & Digital Marketing', 'Social Media Management']),
  _CatGroup('Creative & Media', '🎨', Color(0xFFFF4DCF), Color(0xFFFFE8FA), Color(0xFFFF99E8), ['Graphic Design', 'Video Production & Editing', 'Photography', 'Animation & Motion Graphics', 'Music & Audio', 'Illustration & Art', 'Content Creation', 'Copywriting & Editing', 'Brand Identity & Logo']),
  _CatGroup('Business & Finance', '💼', Color(0xFF0EA5E9), Color(0xFFE0F2FE), Color(0xFF7DD3FC), ['Accounting & Bookkeeping', 'Business Consulting', 'Legal Services', 'Financial Planning', 'Project Management', 'Virtual Assistant', 'Customer Support', 'Sales & Marketing']),
  _CatGroup('Education & Coaching', '📚', Color(0xFF00C48C), Color(0xFFDFFDF4), Color(0xFF7EECD2), ['Tutoring & Teaching', 'Language Lessons', 'Career Coaching', 'Sports Coaching', 'Skills Training', 'Music Lessons', 'Child Development']),
  _CatGroup('Trades & Technical', '🔧', Color(0xFFFF6B2B), Color(0xFFFFF0E8), Color(0xFFFFBC99), ['Electrical Work', 'Plumbing', 'Carpentry & Woodwork', 'Construction & Building', 'HVAC & Air Conditioning', 'Auto Mechanics', 'Painting & Decorating', 'Appliance Repair']),
  _CatGroup('Home & Personal Services', '🏠', Color(0xFFFFB800), Color(0xFFFFF8E0), Color(0xFFFFD966), ['Cleaning & Housekeeping', 'Moving & Relocation', 'Handyman & Repairs', 'Interior Design', 'Landscaping & Gardening', 'Pest Control', 'Childcare & Nannying', 'Pet Care & Walking']),
  _CatGroup('Health & Wellness', '❤️', Color(0xFFFF3366), Color(0xFFFFE8EE), Color(0xFFFF99B3), ['Nursing & Healthcare', 'Personal Training', 'Nutrition & Dietetics', 'Massage Therapy', 'Beauty & Makeup', 'Barbering & Hair', 'Yoga & Meditation']),
  _CatGroup('Events & Hospitality', '🎪', Color(0xFF9B59FF), Color(0xFFF3EEFF), Color(0xFFC9AAFF), ['Event Planning', 'Catering & Cooking', 'DJ & Entertainment', 'MC & Public Speaking', 'Event Decoration', 'Photography & Filming']),
  _CatGroup('Logistics & Transport', '🚚', Color(0xFF14B8A6), Color(0xFFCCFBF1), Color(0xFF5EEAD4), ['Delivery & Courier', 'Driving Services', 'Freight & Haulage', 'Errand Running', 'Motorcycle Dispatch', 'Airport Transfers']),
  _CatGroup('Other', '✦', Color(0xFF8B8FAF), Color(0xFFF5F4FF), Color(0xFFE2E0FF), ['Other — describe below']),
];

// ─── Currency data ────────────────────────────────────────────────────────────

class _Cur {
  final String code, symbol, name, flag;
  const _Cur(this.code, this.symbol, this.name, this.flag);
}

const _kCurs = <_Cur>[
  _Cur('NGN', '₦', 'Nigerian Naira', '🇳🇬'),
  _Cur('USD', '\$', 'US Dollar', '🇺🇸'),
  _Cur('GBP', '£', 'British Pound', '🇬🇧'),
  _Cur('EUR', '€', 'Euro', '🇪🇺'),
  _Cur('GHS', '₵', 'Ghanaian Cedi', '🇬🇭'),
  _Cur('KES', 'KSh', 'Kenyan Shilling', '🇰🇪'),
  _Cur('ZAR', 'R', 'South African Rand', '🇿🇦'),
  _Cur('EGP', 'E£', 'Egyptian Pound', '🇪🇬'),
  _Cur('TZS', 'TSh', 'Tanzanian Shilling', '🇹🇿'),
  _Cur('UGX', 'USh', 'Ugandan Shilling', '🇺🇬'),
  _Cur('XOF', 'CFA', 'West African CFA', '🌍'),
  _Cur('AED', 'AED', 'UAE Dirham', '🇦🇪'),
  _Cur('SAR', 'SAR', 'Saudi Riyal', '🇸🇦'),
  _Cur('INR', '₹', 'Indian Rupee', '🇮🇳'),
  _Cur('CAD', 'CA\$', 'Canadian Dollar', '🇨🇦'),
  _Cur('AUD', 'A\$', 'Australian Dollar', '🇦🇺'),
  _Cur('JPY', '¥', 'Japanese Yen', '🇯🇵'),
  _Cur('CHF', 'Fr', 'Swiss Franc', '🇨🇭'),
  _Cur('BRL', 'R\$', 'Brazilian Real', '🇧🇷'),
  _Cur('MXN', 'MX\$', 'Mexican Peso', '🇲🇽'),
  _Cur('ZMW', 'ZK', 'Zambian Kwacha', '🇿🇲'),
  _Cur('RWF', 'RF', 'Rwandan Franc', '🇷🇼'),
  _Cur('MAD', 'MAD', 'Moroccan Dirham', '🇲🇦'),
];

const _kFincra = {'NGN', 'GHS', 'KES', 'ZAR', 'USD', 'EUR', 'GBP'};

String _sym(String code) {
  for (final c in _kCurs) {
    if (c.code == code) return c.symbol;
  }
  return '\$';
}

// ─── Screen ───────────────────────────────────────────────────────────────────

class PostGigScreen extends StatefulWidget {
  const PostGigScreen({super.key});

  @override
  State<PostGigScreen> createState() => _PostGigScreenState();
}

class _PostGigScreenState extends State<PostGigScreen> {
  int _step = 1;
  bool _loading = false;
  bool _done = false;
  String _error = '';

  // Step 1
  final _titleCtrl = TextEditingController();
  String _type = 'physical';
  String _field = '';
  final _customSkillCtrl = TextEditingController();
  String? _expandedGroup;
  String _catSearch = '';
  final _catSearchCtrl = TextEditingController();

  // wallets map: currency -> balance
  Map<String, double> _wallets = {};

  // Step 2
  String _urgency = 'now';
  String _currency = 'NGN';
  String _expiresOn = '';
  final _payMinCtrl = TextEditingController();
  final _payMaxCtrl = TextEditingController();
  int _slots = 1;
  final _descCtrl = TextEditingController();

  // Location search
  final _locCtrl = TextEditingController();
  List<Map<String, dynamic>> _locResults = [];
  bool _locSelected = false;
  bool _locLoading = false;
  String _location = '';
  double? _lat;
  double? _lng;
  Timer? _locDebounce;

  // Exact address
  final _houseCtrl = TextEditingController();
  final _streetCtrl = TextEditingController();
  final _landmarkCtrl = TextEditingController();
  final _directionsCtrl = TextEditingController();

  // Step 3
  String _payMethod = 'manual';

  @override
  void initState() {
    super.initState();
    _loadWallet();
  }

  Future<void> _loadWallet() async {
    try {
      final uid = supabase.auth.currentUser?.id;
      if (uid == null) return;
      final rows = await supabase.from('wallets').select('currency, balance').eq('user_id', uid);
      if (mounted) {
        setState(() {
          _wallets = { for (final r in (rows as List)) (r as Map)['currency'] as String: ((r['balance'] as num?) ?? 0).toDouble() };
        });
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _customSkillCtrl.dispose();
    _payMinCtrl.dispose();
    _payMaxCtrl.dispose();
    _descCtrl.dispose();
    _locCtrl.dispose();
    _houseCtrl.dispose();
    _streetCtrl.dispose();
    _landmarkCtrl.dispose();
    _directionsCtrl.dispose();
    _catSearchCtrl.dispose();
    _locDebounce?.cancel();
    super.dispose();
  }

  // ─── Location search ────────────────────────────────────────────────────────

  void _onLocChanged(String val) {
    _locDebounce?.cancel();
    setState(() { _locSelected = false; _location = ''; _lat = null; _lng = null; _locResults = []; });
    if (val.length < 3) { setState(() => _locLoading = false); return; }
    setState(() => _locLoading = true);
    _locDebounce = Timer(const Duration(milliseconds: 400), () => _doLocSearch(val));
  }

  Future<void> _doLocSearch(String query) async {
    try {
      final uri = Uri.https('nominatim.openstreetmap.org', '/search', {
        'format': 'json', 'q': query, 'limit': '5', 'addressdetails': '1',
      });
      final resp = await http.get(uri, headers: {'Accept-Language': 'en', 'User-Agent': 'PrimaApp/1.0'});
      final data = jsonDecode(resp.body) as List<dynamic>;
      if (mounted) setState(() { _locResults = data.cast<Map<String, dynamic>>(); _locLoading = false; });
    } catch (_) {
      if (mounted) setState(() { _locResults = []; _locLoading = false; });
    }
  }

  Future<Map<String, double>?> _geocode(String q) async {
    try {
      final uri = Uri.https('nominatim.openstreetmap.org', '/search', {'format': 'json', 'q': q, 'limit': '1'});
      final resp = await http.get(uri, headers: {'User-Agent': 'PrimaApp/1.0'});
      final data = jsonDecode(resp.body) as List<dynamic>;
      if (data.isNotEmpty) {
        return {'lat': double.parse(data[0]['lat'].toString()), 'lng': double.parse(data[0]['lon'].toString())};
      }
    } catch (_) {}
    return null;
  }

  // ─── Submit ─────────────────────────────────────────────────────────────────

  Future<void> _submit() async {
    if (_loading) return;
    setState(() { _loading = true; _error = ''; });
    try {
      final uid = supabase.auth.currentUser?.id;
      if (uid == null) throw Exception('Not logged in');

      final userData = await supabase.from('users').select('selfie_verified').eq('id', uid).single();
      if (userData['selfie_verified'] != true) {
        if (mounted) {
          setState(() => _loading = false);
          _snack('Please complete selfie verification in your profile before posting gigs.');
          context.pop();
          context.go('/profile');
        }
        return;
      }

      final title = _titleCtrl.text.trim();
      final minPay = _payMinCtrl.text.trim();
      final maxPay = _payMaxCtrl.text.trim();
      if (title.isEmpty || minPay.isEmpty || maxPay.isEmpty) {
        setState(() { _error = 'Please fill in title and pay range'; _loading = false; });
        return;
      }

      double? lat = _lat;
      double? lng = _lng;
      if (_type == 'physical' && _location.isNotEmpty && lat == null) {
        final c = await _geocode(_location);
        if (c != null) { lat = c['lat']; lng = c['lng']; }
      }
      if (_type == 'digital' && lat == null) {
        final p = await supabase.from('users').select('location').eq('id', uid).single();
        final loc = p['location'] as String?;
        if (loc != null && loc.isNotEmpty) {
          final c = await _geocode(loc);
          if (c != null) { lat = c['lat']; lng = c['lng']; }
        }
      }

      final expiresAt = _expiresOn.isNotEmpty
          ? DateTime.parse('${_expiresOn}T23:59:59')
          : DateTime.now().add(const Duration(days: 5));

      final customSkill = _customSkillCtrl.text.trim();

      await supabase.from('gigs').insert({
        'poster_id': uid,
        'title': title,
        'description': _descCtrl.text.trim(),
        'type': _type,
        'field': _field,
        'urgency': _urgency,
        'pay_min': double.tryParse(minPay),
        'pay_max': double.tryParse(maxPay),
        'currency': _currency,
        'expires_at': expiresAt.toIso8601String(),
        'location': _location,
        'latitude': lat,
        'longitude': lng,
        'slots': _slots,
        'status': 'open',
        if (customSkill.isNotEmpty) 'custom_skill': customSkill,
        if (_houseCtrl.text.trim().isNotEmpty) 'house_number': _houseCtrl.text.trim(),
        if (_streetCtrl.text.trim().isNotEmpty) 'street': _streetCtrl.text.trim(),
        if (_landmarkCtrl.text.trim().isNotEmpty) 'landmark': _landmarkCtrl.text.trim(),
        if (_directionsCtrl.text.trim().isNotEmpty) 'directions': _directionsCtrl.text.trim(),
        'payment_method': _payMethod,
      });

      if (mounted) setState(() { _done = true; _loading = false; });
      await Future.delayed(const Duration(seconds: 2));
      if (mounted) context.pop();
    } catch (e) {
      if (mounted) setState(() { _error = e.toString().replaceAll('Exception: ', ''); _loading = false; });
    }
  }

  void _snack(String msg, {bool isError = false, bool isSuccess = false}) {
    primaSnack(context, msg, isError: isError, isSuccess: isSuccess);
  }

  // ─── Build ───────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    if (_done) return _buildDoneScreen();
    return Scaffold(
      backgroundColor: const Color(0xFFF8F7FF),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.close, color: _dark),
          onPressed: () => context.pop(),
        ),
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Text(
            'Post a Gig · Step $_step of 3',
            style: const TextStyle(fontSize: 10, color: _purple, fontWeight: FontWeight.w700, letterSpacing: 1.5),
          ),
          Text(
            _step == 1 ? 'What do you need?' : _step == 2 ? 'Details & Pay' : 'Review & Post',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: _dark),
          ),
        ]),
      ),
      body: Column(children: [
        // Progress bar
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
          child: Row(children: List.generate(3, (i) => Expanded(
            child: Container(
              margin: EdgeInsets.only(right: i < 2 ? 6 : 0),
              height: 3,
              decoration: BoxDecoration(
                color: i < _step ? _purple : _border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ))),
        ),
        const SizedBox(height: 4),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (_step == 1) _buildStep1(),
              if (_step == 2) _buildStep2(),
              if (_step == 3) _buildStep3(),
              const SizedBox(height: 24),
              _buildNavButtons(),
              const SizedBox(height: 40),
            ]),
          ),
        ),
      ]),
    );
  }

  // ─── Done screen ─────────────────────────────────────────────────────────────

  Widget _buildDoneScreen() {
    return Scaffold(
      backgroundColor: const Color(0xFFF8F7FF),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Container(
              width: 80, height: 80,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20),
                gradient: const LinearGradient(
                  begin: Alignment.topLeft, end: Alignment.bottomRight,
                  colors: [_purple, Color(0xFF9B59FF), Color(0xFFFF4DCF)],
                  stops: [0.0, 0.52, 1.0],
                ),
              ),
              child: const Icon(Icons.check_rounded, color: Colors.white, size: 44),
            ),
            const SizedBox(height: 20),
            const Text('Gig Posted!', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: _purple)),
            const SizedBox(height: 10),
            const Text(
              'Your gig is now live on the Prima map.\nWorkers nearby are being notified.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, color: _muted, height: 1.6),
            ),
          ]),
        ),
      ),
    );
  }

  // ─── Step 1: What do you need? ───────────────────────────────────────────────

  Widget _buildStep1() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _label('Gig Title'),
      _field_(_titleCtrl, 'e.g. Need a photographer for product shoot'),
      const SizedBox(height: 20),

      _label('Work Type'),
      Row(children: [
        Expanded(child: _typeCard('physical', '📌', 'Physical', 'On-location work', const Color(0xFFFFF0E8), const Color(0xFFFFBC99))),
        const SizedBox(width: 10),
        Expanded(child: _typeCard('digital', '💻', 'Digital', 'Remote / online', const Color(0xFFEEE9FF), const Color(0xFFB8A5FF))),
      ]),
      const SizedBox(height: 20),

      _label('Field / Category'),
      _buildCategoryPicker(),
    ]);
  }

  Widget _typeCard(String type, String emoji, String title, String sub, Color activeBg, Color activeBorder) {
    final active = _type == type;
    return GestureDetector(
      onTap: () => setState(() => _type = type),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: active ? activeBg : _inputBg,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: active ? activeBorder : _border, width: 1.5),
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(emoji, style: const TextStyle(fontSize: 28)),
          const SizedBox(height: 6),
          Text(title, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: active ? _dark : _muted)),
          const SizedBox(height: 2),
          Text(sub, style: const TextStyle(fontSize: 10, color: _muted), textAlign: TextAlign.center),
        ]),
      ),
    );
  }

  Widget _buildCategoryPicker() {
    final filtered = _catSearch.length > 1
        ? _kCatGroups
            .map((cat) {
              final mf = cat.fields
                  .where((f) => f.toLowerCase().contains(_catSearch.toLowerCase()))
                  .toList();
              return mf.isEmpty ? null : _CatGroup(cat.group, cat.icon, cat.color, cat.bg, cat.border, mf);
            })
            .whereType<_CatGroup>()
            .toList()
        : _kCatGroups;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // Search
      TextField(
        controller: _catSearchCtrl,
        onChanged: (v) => setState(() => _catSearch = v),
        style: const TextStyle(fontSize: 13, color: _dark),
        decoration: InputDecoration(
          hintText: 'Search any field or profession...',
          hintStyle: const TextStyle(color: Color(0xFFA09DC8), fontSize: 13),
          prefixIcon: const Icon(Icons.search_rounded, size: 18, color: _muted),
          suffixIcon: _catSearch.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.clear, size: 18, color: _muted),
                  onPressed: () { _catSearchCtrl.clear(); setState(() => _catSearch = ''); },
                )
              : null,
          filled: true, fillColor: _inputBg,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _border)),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _border)),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _purple, width: 1.5)),
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        ),
      ),
      const SizedBox(height: 8),

      // Selected display
      if (_field.isNotEmpty) ...[
        Container(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
          margin: const EdgeInsets.only(bottom: 8),
          decoration: BoxDecoration(
            color: const Color(0xFFEEE9FF),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFFB8A5FF), width: 1.5),
          ),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('SELECTED', style: TextStyle(fontSize: 10, color: _muted, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
                const SizedBox(height: 2),
                Text('✓ $_field', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _purple)),
              ]),
            ),
            GestureDetector(
              onTap: () => setState(() { _field = ''; _customSkillCtrl.clear(); }),
              child: const Text('×', style: TextStyle(fontSize: 22, color: _muted, height: 1)),
            ),
          ]),
        ),
      ],

      // Accordion list in bordered container
      Container(
        height: 280,
        decoration: BoxDecoration(
          border: Border.all(color: _border, width: 1.5),
          borderRadius: BorderRadius.circular(12),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: ListView.builder(
            itemCount: filtered.length,
            itemBuilder: (_, i) {
              final cat = filtered[i];
              final isOpen = _expandedGroup == cat.group || _catSearch.length > 1;
              final isLast = i == filtered.length - 1;
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  InkWell(
                    onTap: () => setState(() {
                      _expandedGroup = (isOpen && _catSearch.isEmpty) ? null : cat.group;
                    }),
                    child: Container(
                      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                      color: isOpen ? cat.bg : Colors.white,
                      child: Row(children: [
                        Text(cat.icon, style: const TextStyle(fontSize: 18)),
                        const SizedBox(width: 10),
                        Text(cat.group, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: isOpen ? cat.color : _dark)),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                          decoration: BoxDecoration(
                            color: cat.bg, borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: cat.border),
                          ),
                          child: Text('${cat.fields.length}', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: cat.color)),
                        ),
                        const Spacer(),
                        AnimatedRotation(
                          turns: isOpen ? 0.5 : 0,
                          duration: const Duration(milliseconds: 200),
                          child: const Icon(Icons.keyboard_arrow_down_rounded, size: 18, color: _muted),
                        ),
                      ]),
                    ),
                  ),
                  if (isOpen)
                    Container(
                      color: const Color(0xFFFAFAFF),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: cat.fields.map((f) {
                          final sel = _field == f;
                          return InkWell(
                            onTap: () => setState(() {
                              _field = sel ? '' : f;
                              _catSearch = '';
                              _catSearchCtrl.clear();
                              if (!sel) _expandedGroup = null;
                            }),
                            child: Container(
                              padding: const EdgeInsets.fromLTRB(44, 10, 14, 10),
                              decoration: BoxDecoration(
                                color: sel ? cat.bg : Colors.transparent,
                                border: const Border(top: BorderSide(color: Color(0xFFF5F4FF), width: 1)),
                              ),
                              child: Row(children: [
                                Expanded(child: Text(f, style: TextStyle(fontSize: 13, fontWeight: sel ? FontWeight.w700 : FontWeight.w400, color: sel ? cat.color : const Color(0xFF5B5887)))),
                                if (sel) Text('✓', style: TextStyle(color: cat.color, fontSize: 14)),
                              ]),
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                  if (!isLast && !isOpen)
                    Container(height: 1, color: const Color(0xFFF5F4FF)),
                ],
              );
            },
          ),
        ),
      ),

      // Custom skill input
      if (_field.isNotEmpty) ...[
        const SizedBox(height: 12),
        const Text('SPECIFIC SKILL / TITLE (OPTIONAL)', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: _muted, letterSpacing: 0.8)),
        const SizedBox(height: 6),
        _field_(_customSkillCtrl, 'e.g. React Developer, Wedding Photographer...'),
        const SizedBox(height: 5),
        const Text('💡 This helps people find exactly what you offer', style: TextStyle(fontSize: 10, color: _muted)),
      ],
    ]);
  }

    // ─── Step 2: Details & Pay ───────────────────────────────────────────────────

  Widget _buildStep2() {
    final curSymbol = _sym(_currency);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // Urgency
      _label('Urgency'),
      Row(children: [
        Expanded(child: _urgencyBtn('now', 'NOW', const Color(0xFFFF3366), const Color(0xFFFFE8EE))),
        const SizedBox(width: 6),
        Expanded(child: _urgencyBtn('today', 'TODAY', const Color(0xFFFF6B2B), const Color(0xFFFFF0E8))),
        const SizedBox(width: 6),
        Expanded(child: _urgencyBtn('scheduled', 'SCHEDULED', _purple, const Color(0xFFEEE9FF))),
        const SizedBox(width: 6),
        Expanded(child: _urgencyBtn('flexible', 'FLEXIBLE', const Color(0xFFA09DC8), const Color(0xFFF5F4FF))),
      ]),
      const SizedBox(height: 18),

      // Currency picker
      _label('Currency'),
      GestureDetector(
        onTap: _pickCurrency,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          decoration: BoxDecoration(color: _inputBg, borderRadius: BorderRadius.circular(10), border: Border.all(color: _border, width: 1.5)),
          child: Row(children: [
            Text(_kCurs.firstWhere((c) => c.code == _currency, orElse: () => _kCurs.first).flag, style: const TextStyle(fontSize: 20)),
            const SizedBox(width: 10),
            Text('$_currency — ${_kCurs.firstWhere((c) => c.code == _currency, orElse: () => _kCurs.first).name}', style: const TextStyle(fontSize: 14, color: _dark)),
            const Spacer(),
            const Icon(Icons.keyboard_arrow_down_rounded, color: _muted, size: 20),
          ]),
        ),
      ),
      const SizedBox(height: 16),

      // Expiry date
      _label('Specific Expiry Date'),
      GestureDetector(
        onTap: _pickDate,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          decoration: BoxDecoration(color: _inputBg, borderRadius: BorderRadius.circular(10), border: Border.all(color: _border, width: 1.5)),
          child: Row(children: [
            const Icon(Icons.calendar_today_outlined, color: _muted, size: 18),
            const SizedBox(width: 10),
            Text(
              _expiresOn.isEmpty ? 'Pick a date (defaults to 7 days)' : _expiresOn,
              style: TextStyle(fontSize: 14, color: _expiresOn.isEmpty ? const Color(0xFFA09DC8) : _dark),
            ),
          ]),
        ),
      ),
      const SizedBox(height: 16),

      // Pay range
      Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _label('Min Pay ($curSymbol)'),
          _field_(_payMinCtrl, 'e.g. 80', keyboard: TextInputType.number),
        ])),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _label('Max Pay ($curSymbol)'),
          _field_(_payMaxCtrl, 'e.g. 160', keyboard: TextInputType.number),
        ])),
      ]),
      const SizedBox(height: 16),

      // Location section
      if (_type == 'digital') ...[
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFFEEE9FF), borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFB8A5FF), width: 1.5),
          ),
          child: const Row(children: [
            Icon(Icons.public_rounded, color: _purple, size: 26),
            SizedBox(width: 10),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Shown on map as Remote', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _purple)),
              SizedBox(height: 2),
              Text('Pinned to your profile location. Workers worldwide can still apply.', style: TextStyle(fontSize: 11, color: _muted, height: 1.5)),
            ])),
          ]),
        ),
        const SizedBox(height: 16),
      ] else ...[
        Row(children: [
          _label('General Area'),
          const SizedBox(width: 6),
          const Text('— shown publicly on map', style: TextStyle(fontSize: 10, color: _muted, fontWeight: FontWeight.w500)),
        ]),
        _buildLocationSearch(),
        const SizedBox(height: 16),
      ],

      // Slots
      _label('Open Slots'),
      Wrap(spacing: 8, runSpacing: 8, children: [
        ...[1, 2, 3, 4, 5].map((n) => _slotBtn(n, '$n')),
        _slotBtn(10, '10+'),
      ]),
      const SizedBox(height: 16),

      // Description
      _label('Description (optional)'),
      TextField(
        controller: _descCtrl,
        maxLines: 4,
        style: const TextStyle(fontSize: 14, color: _dark),
        decoration: _dec('Describe what you need, requirements, timeline...'),
      ),
    ]);
  }

  Widget _urgencyBtn(String key, String label, Color color, Color bg) {
    final active = _urgency == key;
    return GestureDetector(
      onTap: () => setState(() => _urgency = key),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(vertical: 9),
        decoration: BoxDecoration(
          color: active ? bg : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: active ? color : _border, width: 1.5),
        ),
        child: Text(label, textAlign: TextAlign.center, style: TextStyle(fontSize: 8, fontWeight: FontWeight.w800, color: active ? color : _muted, letterSpacing: 0.6)),
      ),
    );
  }

  Widget _slotBtn(int n, String label) {
    final active = _slots == n;
    return GestureDetector(
      onTap: () => setState(() => _slots = n),
      child: Container(
        width: 44, height: 40,
        decoration: BoxDecoration(
          color: active ? const Color(0xFFEEE9FF) : _inputBg,
          borderRadius: BorderRadius.circular(9),
          border: Border.all(color: active ? const Color(0xFFB8A5FF) : _border, width: 1.5),
        ),
        child: Center(child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: active ? _purple : _muted))),
      ),
    );
  }

  Widget _buildLocationSearch() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      TextField(
        controller: _locCtrl,
        style: const TextStyle(fontSize: 14, color: _dark),
        decoration: _dec('Search city, island, area...').copyWith(
          suffixIcon: _locLoading
              ? const Padding(padding: EdgeInsets.all(12), child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: _muted)))
              : (_locSelected ? const Icon(Icons.check_circle, color: _green, size: 20) : null),
        ),
        onChanged: _onLocChanged,
      ),

      // Results list (inline, not absolute)
      if (_locResults.isNotEmpty && !_locSelected) ...[
        const SizedBox(height: 4),
        Container(
          decoration: BoxDecoration(
            color: Colors.white, borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFB8A5FF), width: 1.5),
            boxShadow: const [BoxShadow(color: Color(0x1A6C47FF), blurRadius: 20, offset: Offset(0, 8))],
          ),
          child: Column(children: _locResults.asMap().entries.map((e) {
            final i = e.key;
            final r = e.value;
            final addr = r['address'] as Map<String, dynamic>? ?? {};
            final city = (addr['city'] ?? addr['town'] ?? addr['village'] ?? addr['county'] ?? '') as String;
            final state = (addr['state'] ?? '') as String;
            final country = (addr['country'] ?? '') as String;
            final shortName = [city, state, country].where((s) => s.isNotEmpty).join(', ');
            final displayName = r['display_name'] as String? ?? '';
            return GestureDetector(
              onTap: () {
                final name = shortName.isNotEmpty ? shortName : displayName;
                setState(() {
                  _locCtrl.text = name;
                  _location = name;
                  _lat = double.tryParse(r['lat']?.toString() ?? '');
                  _lng = double.tryParse(r['lon']?.toString() ?? '');
                  _locResults = [];
                  _locSelected = true;
                });
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                decoration: BoxDecoration(
                  border: i < _locResults.length - 1 ? const Border(bottom: BorderSide(color: Color(0xFFF5F4FF), width: 1)) : null,
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(
                    shortName.isNotEmpty ? shortName : (displayName.split(',').first),
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _dark),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    displayName.length > 55 ? '${displayName.substring(0, 55)}...' : displayName,
                    style: const TextStyle(fontSize: 10, color: _muted),
                  ),
                ]),
              ),
            );
          }).toList()),
        ),
      ],

      if (_locSelected) ...[
        const SizedBox(height: 6),
        const Text('✓ Pin placed on map', style: TextStyle(fontSize: 11, color: _green)),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: _inputBg, borderRadius: BorderRadius.circular(14),
            border: Border.all(color: _border, width: 1.5),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: const [
              Icon(Icons.lock_outline, color: _dark, size: 20),
              SizedBox(width: 8),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Exact Address', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _dark)),
                Text('Only shared with accepted workers', style: TextStyle(fontSize: 10, color: _muted)),
              ])),
            ]),
            const SizedBox(height: 14),
            _label('House / Building Number', size: 10),
            _field_(_houseCtrl, 'e.g. 12, Flat 3B...', bg: Colors.white),
            const SizedBox(height: 10),
            _label('Street Name', size: 10),
            _field_(_streetCtrl, 'e.g. Adeola Odeku Street', bg: Colors.white),
            const SizedBox(height: 10),
            _label('Nearest Landmark', size: 10),
            _field_(_landmarkCtrl, 'e.g. Beside First Bank...', bg: Colors.white),
            const SizedBox(height: 10),
            _label('Additional Directions (optional)', size: 10),
            TextField(
              controller: _directionsCtrl,
              maxLines: 3,
              style: const TextStyle(fontSize: 14, color: _dark),
              decoration: _dec('e.g. Take the gate on the left...').copyWith(filled: true, fillColor: Colors.white),
            ),
          ]),
        ),
      ],
    ]);
  }

  // ─── Step 3: Review & Post ───────────────────────────────────────────────────

  Widget _buildStep3() {
    final sym = _sym(_currency);
    final walletEnabled = _kFincra.contains(_currency);

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // Summary table
      Container(
        decoration: BoxDecoration(
          color: _inputBg, borderRadius: BorderRadius.circular(14),
          border: Border.all(color: _border, width: 1.5),
        ),
        child: Column(children: [
          _reviewRow('Title', _titleCtrl.text.isEmpty ? '—' : _titleCtrl.text, last: false),
          _reviewRow('Type', _type, last: false),
          _reviewRow('Field', _field.isEmpty ? '—' : _field, last: false),
          _reviewRow('Urgency', _urgency.toUpperCase(), last: false),
          _reviewRow('Pay Range', '$sym${_payMinCtrl.text} – $sym${_payMaxCtrl.text}', last: false),
          _reviewRow('Payment', _payMethod == 'wallet' ? 'Pay from Wallet' : 'Pay Manually', last: false),
          _reviewRow('Expires', _expiresOn.isEmpty ? '7 days from posting' : _expiresOn, last: false),
          _reviewRow('Location', _type == 'digital' ? 'Remote' : (_location.isEmpty ? '—' : _location), last: false),
          _reviewRow('Slots', '$_slots', last: true),
        ]),
      ),
      const SizedBox(height: 20),

      _label('How will you pay the worker?'),
      if (!walletEnabled) ...[
        Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(
            color: const Color(0xFFFFF8E0), borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFFFFD966), width: 1.5),
          ),
          child: Row(children: [
            const Icon(Icons.lock_outline, color: Color(0xFFB8860B), size: 18),
            const SizedBox(width: 8),
            Expanded(child: Text('$_currency is not supported for wallet payments. This gig will use manual payment.', style: const TextStyle(fontSize: 12, color: Color(0xFFB8860B), height: 1.5))),
          ]),
        ),
      ],
      Row(children: [
        Expanded(child: _payCard('wallet', 'RECOMMENDED', 'Pay from Wallet', 'Escrow locks funds. Worker gets 90%, Prima keeps 10%.', !walletEnabled)),
        const SizedBox(width: 10),
        Expanded(child: _payCard('manual', 'FLEXIBLE', 'Pay Manually', 'Cash or transfer. 10% commission is owed after receipt.', false)),
      ]),
      const SizedBox(height: 16),

      // Wallet balance display
      if (_payMethod == 'wallet' && _kFincra.contains(_currency)) _buildWalletBalanceBox(),
      if (_payMethod == 'wallet' && _kFincra.contains(_currency)) const SizedBox(height: 12),

      // Trust notice — changes based on payment method
      if (_payMethod == 'wallet') ...[
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFFDFFDF4), borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF7EECD2), width: 1.5),
          ),
          child: const Row(children: [
            Icon(Icons.lock_outline, color: Color(0xFF00A878), size: 26),
            SizedBox(width: 10),
            Expanded(child: Text(
              'Funds are held in escrow and released to the worker only after you confirm job completion. Fully protected.',
              style: TextStyle(fontSize: 12, color: Color(0xFF00A878), height: 1.6),
            )),
          ]),
        ),
      ] else ...[
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFFEEE9FF), borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFB8A5FF), width: 1.5),
          ),
          child: const Row(children: [
            Icon(Icons.shield_outlined, color: _purple, size: 26),
            SizedBox(width: 10),
            Expanded(child: Text(
              'Both parties confirm completion by uploading receipts with their names. This protects everyone involved.',
              style: TextStyle(fontSize: 12, color: _purple, height: 1.6),
            )),
          ]),
        ),
      ],

      if (_error.isNotEmpty) ...[
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFFFFE8EE), borderRadius: BorderRadius.circular(8),
            border: Border.all(color: const Color(0xFFFF99B3), width: 1.5),
          ),
          child: Text(_error, style: const TextStyle(fontSize: 13, color: Color(0xFFFF3366))),
        ),
      ],
    ]);
  }

  Widget _buildWalletBalanceBox() {
    final balance  = _wallets[_currency] ?? 0.0;
    final hasWallet = _wallets.containsKey(_currency);
    final minPay   = double.tryParse(_payMinCtrl.text) ?? 0;
    final sym      = _sym(_currency);
    final ok       = hasWallet && balance >= minPay;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: ok ? const Color(0xFFDFFDF4) : const Color(0xFFFFF0E8),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ok ? const Color(0xFF7EECD2) : const Color(0xFFFFBC99), width: 1.5),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(
          !hasWallet
              ? 'You don\'t have a $_currency wallet yet. Fund one first.'
              : 'Wallet balance: $sym${balance.toStringAsFixed(0)}.  Minimum escrow needed: $sym${minPay.toStringAsFixed(0)}.',
          style: TextStyle(
            fontSize: 12, height: 1.6,
            color: ok ? const Color(0xFF00A878) : const Color(0xFFFF6B2B),
          ),
        ),
        if (!ok) ...[
          const SizedBox(height: 8),
          GestureDetector(
            onTap: () { context.pop(); context.push('/wallet'); },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFFFF6B2B),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text('Fund Wallet', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
            ),
          ),
        ],
      ]),
    );
  }

  Widget _reviewRow(String key, String val, {required bool last}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
      decoration: BoxDecoration(
        border: last ? null : const Border(bottom: BorderSide(color: _border, width: 1)),
      ),
      child: Row(children: [
        Text(key, style: const TextStyle(fontSize: 13, color: _muted)),
        const Spacer(),
        Flexible(child: Text(val, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _dark), textAlign: TextAlign.right, maxLines: 2, overflow: TextOverflow.ellipsis)),
      ]),
    );
  }

  Widget _payCard(String key, String tag, String title, String desc, bool disabled) {
    final active = _payMethod == key && !disabled;
    return GestureDetector(
      onTap: disabled ? null : () => setState(() { _payMethod = key; _error = ''; }),
      child: Opacity(
        opacity: disabled ? 0.55 : 1.0,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: active ? const Color(0xFFEEE9FF) : (disabled ? const Color(0xFFF9F9FB) : Colors.white),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: active ? _purple : _border, width: 1.5),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (disabled && key == 'wallet') ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(color: const Color(0xFFE2E0FF), borderRadius: BorderRadius.circular(4)),
                child: const Text('UNAVAILABLE', style: TextStyle(fontSize: 7, fontWeight: FontWeight.w800, color: _muted, letterSpacing: 0.5)),
              ),
              const SizedBox(height: 5),
            ],
            Text(tag, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: active ? _purple : _muted, letterSpacing: 0.8)),
            const SizedBox(height: 4),
            Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: _dark)),
            const SizedBox(height: 3),
            Text(desc, style: TextStyle(fontSize: 11, height: 1.5, color: active ? _purple : _muted)),
          ]),
        ),
      ),
    );
  }

  // ─── Nav buttons ─────────────────────────────────────────────────────────────

  Widget _buildNavButtons() {
    final isLast = _step == 3;
    return Row(children: [
      if (_step > 1) ...[
        Expanded(
          child: GestureDetector(
            onTap: () => setState(() { _step--; _error = ''; }),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 14),
              decoration: BoxDecoration(
                color: _inputBg, borderRadius: BorderRadius.circular(12),
                border: Border.all(color: _border, width: 1.5),
              ),
              child: const Center(child: Text('← Back', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _muted))),
            ),
          ),
        ),
        const SizedBox(width: 10),
      ],
      Expanded(
        flex: 2,
        child: GestureDetector(
          onTap: _loading ? null : (isLast ? _submit : () => setState(() => _step++)),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 14),
            decoration: BoxDecoration(
              gradient: _loading ? null : const LinearGradient(
                begin: Alignment.topLeft, end: Alignment.bottomRight,
                colors: [_purple, Color(0xFF9B59FF)],
              ),
              color: _loading ? const Color(0xFFB8A5FF) : null,
              borderRadius: BorderRadius.circular(12),
              boxShadow: _loading ? null : const [BoxShadow(color: Color(0x4D6C47FF), blurRadius: 16, offset: Offset(0, 4))],
            ),
            child: Center(
              child: _loading
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Text(
                      isLast ? 'Go Live ✦' : 'Continue →',
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white),
                    ),
            ),
          ),
        ),
      ),
    ]);
  }

  // ─── Pickers ─────────────────────────────────────────────────────────────────

  Future<void> _pickCurrency() async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        maxChildSize: 0.88,
        builder: (_, ctrl) => Column(children: [
          const SizedBox(height: 12),
          Container(width: 40, height: 4, decoration: BoxDecoration(color: _border, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 12),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 20),
            child: Align(alignment: Alignment.centerLeft, child: Text('Select Currency', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: _dark))),
          ),
          const SizedBox(height: 8),
          const Divider(color: _border, height: 1),
          Expanded(
            child: ListView.builder(
              controller: ctrl,
              itemCount: _kCurs.length,
              itemBuilder: (_, i) {
                final c = _kCurs[i];
                final sel = _currency == c.code;
                return ListTile(
                  leading: Text(c.flag, style: const TextStyle(fontSize: 22)),
                  title: Text('${c.code} — ${c.name}', style: TextStyle(fontSize: 14, fontWeight: sel ? FontWeight.w700 : FontWeight.w500, color: sel ? _purple : _dark)),
                  subtitle: Text(c.symbol, style: const TextStyle(fontSize: 12, color: _muted)),
                  trailing: sel ? const Icon(Icons.check_circle, color: _purple, size: 20) : null,
                  onTap: () {
                    setState(() {
                      _currency = c.code;
                      if (!_kFincra.contains(c.code)) _payMethod = 'manual';
                    });
                    Navigator.pop(ctx);
                  },
                );
              },
            ),
          ),
        ]),
      ),
    );
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 5)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 5)),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(primary: _purple, onPrimary: Colors.white),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _expiresOn = DateFormat('yyyy-MM-dd').format(picked));
  }

  // ─── Shared helpers ───────────────────────────────────────────────────────────

  Widget _label(String text, {double size = 11}) => Padding(
    padding: const EdgeInsets.only(bottom: 7),
    child: Text(
      text.toUpperCase(),
      style: TextStyle(fontSize: size, fontWeight: FontWeight.w700, color: _muted, letterSpacing: 0.8),
    ),
  );

  InputDecoration _dec(String hint) => InputDecoration(
    hintText: hint,
    hintStyle: const TextStyle(color: Color(0xFFA09DC8), fontSize: 14),
    filled: true, fillColor: _inputBg,
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _border)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _border)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _purple, width: 1.5)),
    contentPadding: const EdgeInsets.all(14),
  );

  Widget _field_(TextEditingController ctrl, String hint, {TextInputType? keyboard, Color? bg}) => TextField(
    controller: ctrl,
    keyboardType: keyboard,
    style: const TextStyle(fontSize: 14, color: _dark),
    decoration: _dec(hint).copyWith(filled: true, fillColor: bg ?? _inputBg),
  );
}

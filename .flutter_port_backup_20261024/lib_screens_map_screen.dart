import 'dart:async';
import 'dart:math';
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:share_plus/share_plus.dart';

import '../main.dart';
import '../locale.dart';
import '../config.dart';
import '../utils/dt.dart';
import '../widgets/prima_loader.dart';

// ─── Category data ────────────────────────────────────────────────────────────

class _Cat {
  final String group, icon;
  final Color color, bg;
  final List<String> fields;
  const _Cat(this.group, this.icon, this.color, this.bg, this.fields);
}

const _kCats = <_Cat>[
  _Cat('Technology & Digital', '💻', Color(0xFF6C47FF), Color(0xFFEEE9FF), [
    'Software Development', 'Web Design & UI/UX', 'Mobile Apps', 'IT Support & Networks',
    'Cybersecurity', 'Data & Analytics', 'AI & Automation', 'DevOps & Cloud',
    'Database Administration', 'QA & Testing', 'Game Development', 'Blockchain & Web3',
    'No-Code / Low-Code', 'SEO & Digital Marketing', 'Social Media Management',
  ]),
  _Cat('Creative & Media', '🎨', Color(0xFFFF4DCF), Color(0xFFFFE8FA), [
    'Graphic Design', 'Video Production & Editing', 'Photography', 'Animation & Motion Graphics',
    'Music & Audio', 'Illustration & Art', 'Content Creation', 'Copywriting & Editing',
    'Brand Identity & Logo', 'Podcast Production', '3D Modeling & Rendering',
    'Social Media Content', 'Voice Over', 'Scriptwriting',
  ]),
  _Cat('Business & Finance', '💼', Color(0xFF0EA5E9), Color(0xFFE0F2FE), [
    'Accounting & Bookkeeping', 'Business Consulting', 'Legal Services', 'Financial Planning',
    'Project Management', 'Virtual Assistant', 'Customer Support', 'Sales & Marketing',
    'HR & Recruitment', 'E-commerce Management', 'Market Research',
    'Translation & Localization', 'Tax & Compliance', 'Business Plan Writing',
  ]),
  _Cat('Education & Coaching', '📚', Color(0xFF00C48C), Color(0xFFDFFDF4), [
    'Tutoring & Teaching', 'Language Lessons', 'Career Coaching', 'Life Coaching',
    'Sports Coaching', 'Skills Training', 'Music Lessons', 'Art & Craft Classes',
    'Exam Preparation', 'Online Course Creation', 'Child Development',
  ]),
  _Cat('Trades & Technical', '🔧', Color(0xFFFF6B2B), Color(0xFFFFF0E8), [
    'Electrical Work', 'Plumbing', 'Carpentry & Woodwork', 'Construction & Building',
    'HVAC & Air Conditioning', 'Solar & Renewable Energy', 'Welding & Fabrication',
    'Auto Mechanics', 'Painting & Decorating', 'Tiling & Flooring', 'Roofing',
    'Appliance Repair', 'Generator & Power Systems', 'Borehole & Water Systems', 'Glazing & Windows',
  ]),
  _Cat('Home & Personal Services', '🏠', Color(0xFFFFB800), Color(0xFFFFF8E0), [
    'Cleaning & Housekeeping', 'Moving & Relocation', 'Handyman & Repairs', 'Interior Design',
    'Landscaping & Gardening', 'Pest Control', 'Security Services', 'Personal Shopping',
    'Laundry & Ironing', 'Childcare & Nannying', 'Elder Care', 'Pet Care & Walking',
    'Fumigation', 'Home Staging',
  ]),
  _Cat('Health & Wellness', '❤️', Color(0xFFFF3366), Color(0xFFFFE8EE), [
    'Nursing & Healthcare', 'Physiotherapy', 'Personal Training', 'Nutrition & Dietetics',
    'Mental Health Support', 'Massage Therapy', 'Beauty & Makeup', 'Barbering & Hair',
    'Yoga & Meditation', 'Dental Care', 'Optometry', 'Pharmacy & Drug Dispensing', 'First Aid & Emergency',
  ]),
  _Cat('Events & Hospitality', '🎪', Color(0xFF9B59FF), Color(0xFFF3EEFF), [
    'Event Planning', 'Catering & Cooking', 'DJ & Entertainment', 'MC & Public Speaking',
    'Waitering & Service', 'Photography & Filming', 'Event Decoration', 'Makeup Artist',
    'Hype Man & Host', 'Balloon & Decor', 'Band & Live Music', 'Security & Ushering',
  ]),
  _Cat('Logistics & Transport', '🚚', Color(0xFF14B8A6), Color(0xFFCCFBF1), [
    'Delivery & Courier', 'Driving Services', 'Freight & Haulage', 'Errand Running',
    'Warehousing', 'Motorcycle Dispatch', 'Airport Transfers', 'Moving Assistance',
    'Last-Mile Delivery', 'Cold Chain Logistics',
  ]),
  _Cat('Other', '✦', Color(0xFF8B8FAF), Color(0xFFF5F4FF), ['Other — describe below']),
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const _purple = Color(0xFF6C47FF);
const _green = Color(0xFF00C48C);
const _dark = Color(0xFF14123A);
const _muted = Color(0xFF8B8FAF);

Color _urgencyColor(String? u) {
  switch (u) {
    case 'now': return const Color(0xFFFF3366);
    case 'today': return const Color(0xFFFF6B2B);
    case 'scheduled': return _purple;
    default: return const Color(0xFFA09DC8);
  }
}

Color _urgencyBg(String? u) {
  switch (u) {
    case 'now': return const Color(0xFFFFE8EE);
    case 'today': return const Color(0xFFFFF0E8);
    case 'scheduled': return const Color(0xFFEEE9FF);
    default: return const Color(0xFFF5F4FF);
  }
}

String _currencySymbol(String? code) {
  const m = {'USD': '\$', 'NGN': '₦', 'GHS': '₵', 'KES': 'KSh', 'ZAR': 'R', 'EUR': '€', 'GBP': '£'};
  return m[code ?? 'USD'] ?? '\$';
}

String _fmtPay(dynamic v) {
  if (v == null) return '?';
  final n = v is num ? v.toDouble() : double.tryParse(v.toString());
  if (n == null) return v.toString();
  return n % 1 == 0 ? n.toInt().toString() : n.toStringAsFixed(1);
}

String _timeAgo(String? d) {
  if (d == null) return '';
  final diff = DateTime.now().difference(parseTs(d).toLocal());
  if (diff.inSeconds < 60) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  return '${diff.inDays ~/ 7}w ago';
}

String _markerLabel(Map<String, dynamic> gig) {
  if (gig['type'] == 'digital') {
    final t = (gig['title'] as String? ?? 'Digital');
    return 'Remote · ${t.length > 12 ? t.substring(0, 12) : t}';
  }
  final street = gig['street'] as String?;
  if (street != null && street.isNotEmpty) return street;
  final loc = gig['location'] as String?;
  if (loc != null && loc.isNotEmpty) return loc.split(',').first;
  final t = gig['title'] as String? ?? '';
  return t.length > 18 ? t.substring(0, 18) : t;
}

// ─── Triangle painter for marker pointer ──────────────────────────────────────

class _TrianglePainter extends CustomPainter {
  final Color color;
  const _TrianglePainter(this.color);
  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawPath(
      ui.Path()..moveTo(0, 0)..lineTo(size.width, 0)..lineTo(size.width / 2, size.height)..close(),
      ui.Paint()..color = color,
    );
  }
  @override
  bool shouldRepaint(_) => false;
}

// ─── Pulsing dot for user location ────────────────────────────────────────────

class _PulsingDot extends StatefulWidget {
  const _PulsingDot();
  @override
  State<_PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<_PulsingDot> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _scale;
  late final Animation<double> _opacity;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(seconds: 2));
    _scale = Tween(begin: 1.0, end: 2.5).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOut));
    _opacity = Tween(begin: 0.6, end: 0.0).animate(_ctrl);
    _ctrl.repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (_, _) => Stack(
        alignment: Alignment.center,
        children: [
          Transform.scale(
            scale: _scale.value,
            child: Container(
              width: 20, height: 20,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _purple.withValues(alpha: _opacity.value * 0.4),
              ),
            ),
          ),
          Container(
            width: 16, height: 16,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: _purple,
              border: Border.all(color: Colors.white, width: 3),
              boxShadow: const [BoxShadow(color: Color(0x996C47FF), blurRadius: 12)],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Cluster data holder ──────────────────────────────────────────────────────

class _Cluster {
  double sumLat = 0, sumLng = 0;
  final List<Map<String, dynamic>> gigs = [];
  double get lat => gigs.isEmpty ? 0 : sumLat / gigs.length;
  double get lng => gigs.isEmpty ? 0 : sumLng / gigs.length;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

class MapScreen extends StatefulWidget {
  const MapScreen({super.key});
  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  final _mapCtrl = MapController();
  final _rng = Random();
  LatLng? _userPos;
  List<Map<String, dynamic>> _gigs = [];
  Map<String, dynamic>? _selectedGig;
  String _catFilter = 'All';
  int? _radiusKm;
  bool _loading = true;
  bool _applying = false;
  bool _applied = false;
  int _liveCount = 312;
  int _nowCount = 17;
  Set<String> _savedIds = {};
  String? _toast;
  Timer? _liveTimer;
  Timer? _expireTimer;
  RealtimeChannel? _channel;
  final DraggableScrollableController _sheetCtrl = DraggableScrollableController();
  bool _sheetDismissing = false;
  String _searchQuery = '';
  bool _darkMap = false;
  double _zoom = 13;
  final TextEditingController _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _getLocation();
    _fetchGigs();
    _fetchSavedIds();
    _startLiveAnim();
    _subscribeRealtime();
    _sheetCtrl.addListener(_onSheetChange);
    mapFocusNotifier.addListener(_onMapFocusRequest);
    // ValueNotifier.addListener doesn't fire for the current value,
    // so explicitly check for a pending gig after the first frame is built.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mapFocusNotifier.value != null) _onMapFocusRequest();
    });
    _expireTimer = Timer.periodic(const Duration(minutes: 1), (_) => _removeExpiredLocally());
  }

  void _onSheetChange() {
    if (!_sheetCtrl.isAttached || _selectedGig == null || _sheetDismissing) return;
    if (_sheetCtrl.size < 0.18) {
      _sheetDismissing = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() { _selectedGig = null; _applied = false; _sheetDismissing = false; });
      });
    }
  }

  @override
  void dispose() {
    _liveTimer?.cancel();
    _expireTimer?.cancel();
    mapFocusNotifier.removeListener(_onMapFocusRequest);
    _sheetCtrl.removeListener(_onSheetChange);
    _sheetCtrl.dispose();
    _searchCtrl.dispose();
    if (_channel != null) supabase.removeChannel(_channel!);
    super.dispose();
  }

  void _onMapFocusRequest() {
    final gig = mapFocusNotifier.value;
    if (gig == null || !mounted) return;
    mapFocusNotifier.value = null;
    final lat = (gig['latitude'] as num?)?.toDouble();
    final lng = (gig['longitude'] as num?)?.toDouble();
    if (lat == null || lng == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      try { _mapCtrl.move(LatLng(lat, lng), 17); } catch (_) {}
      if (_sheetCtrl.isAttached) _sheetCtrl.jumpTo(0.88);
      setState(() { _selectedGig = gig; _applied = false; _applying = false; });
    });
  }

  void _removeExpiredLocally() {
    if (!mounted) return;
    final now = DateTime.now();
    final updated = _gigs.where((g) {
      final exp = g['expires_at'] as String?;
      return exp == null || parseTs(exp).isAfter(now);
    }).toList();
    if (updated.length != _gigs.length) setState(() => _gigs = updated);
  }

  void _startLiveAnim() {
    _liveTimer = Timer.periodic(const Duration(milliseconds: 1800), (_) {
      if (!mounted) return;
      setState(() {
        if (_rng.nextDouble() > 0.6) _liveCount += _rng.nextInt(5) - 2;
        if (_rng.nextDouble() > 0.75) _nowCount = max(8, _nowCount + _rng.nextInt(3) - 1);
      });
    });
  }

  void _subscribeRealtime() {
    _channel = supabase
        .channel('flutter-map-gigs')
        .onPostgresChanges(event: PostgresChangeEvent.insert, schema: 'public', table: 'gigs', callback: (_) => _fetchGigs())
        .onPostgresChanges(event: PostgresChangeEvent.update, schema: 'public', table: 'gigs', callback: (_) => _fetchGigs())
        .onPostgresChanges(event: PostgresChangeEvent.delete, schema: 'public', table: 'gigs', callback: (_) => _fetchGigs())
        .subscribe();
  }

  Future<void> _getLocation() async {
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.deniedForever) return;

      // Show last known position immediately so the dot appears fast
      final last = await Geolocator.getLastKnownPosition();
      if (last != null && mounted) {
        setState(() => _userPos = LatLng(last.latitude, last.longitude));
        try { _mapCtrl.move(_userPos!, 13); } catch (_) {}
      }

      // Then get accurate position (no timeLimit — let the OS decide)
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      if (mounted) {
        setState(() => _userPos = LatLng(pos.latitude, pos.longitude));
        if (last == null) try { _mapCtrl.move(_userPos!, 13); } catch (_) {}
      }
    } catch (_) {}
  }

  Future<void> _fetchGigs() async {
    try {
      final nowStr = DateTime.now().toUtc().toIso8601String();
      final data = await supabase
          .from('gigs')
          .select('*, poster:users!gigs_poster_id_fkey(full_name, avatar_url, trust_score, rating, gigs_completed, phone)')
          .eq('status', 'open')
          .isFilter('deleted_at', null)
          .or('expires_at.is.null,expires_at.gt.$nowStr')
          .not('latitude', 'is', null)
          .not('longitude', 'is', null);
      if (!mounted) return;
      final now = DateTime.now();
      setState(() {
        _gigs = List<Map<String, dynamic>>.from(data).where((g) {
          final exp = g['expires_at'] as String?;
          if (exp == null) return true;
          return parseTs(exp).isAfter(now);
        }).toList();
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _fetchSavedIds() async {
    final uid = supabase.auth.currentUser?.id;
    if (uid == null) return;
    try {
      final data = await supabase.from('saved_gigs').select('gig_id').eq('user_id', uid);
      if (mounted) {
        setState(() => _savedIds = Set<String>.from(
          List<Map<String, dynamic>>.from(data).map((s) => s['gig_id'].toString()),
        ));
      }
    } catch (_) {}
  }

  Future<void> _toggleSave(Map<String, dynamic> gig) async {
    final uid = supabase.auth.currentUser?.id;
    if (uid == null) return;
    final id = gig['id'].toString();
    if (_savedIds.contains(id)) {
      await supabase.from('saved_gigs').delete().eq('user_id', uid).eq('gig_id', id);
      setState(() { _savedIds.remove(id); _toast = 'Gig removed'; });
    } else {
      await supabase.from('saved_gigs').insert({'user_id': uid, 'gig_id': id});
      setState(() { _savedIds.add(id); _toast = 'Gig saved ✓'; });
    }
    Future.delayed(const Duration(milliseconds: 1800), () { if (mounted) setState(() => _toast = null); });
  }

  Future<void> _applyToGig() async {
    if (_applying || _selectedGig == null) return;
    setState(() => _applying = true);
    final uid = supabase.auth.currentUser?.id;
    if (uid == null) { setState(() => _applying = false); return; }

    try {
      final userData = await supabase.from('users').select('selfie_verified, full_name, bio').eq('id', uid).single();
      if (userData['selfie_verified'] != true) {
        if (mounted) {
          setState(() => _applying = false);
          _showSnack('Please complete selfie verification in your profile first.', isError: true);
        }
        return;
      }
      if ((userData['full_name'] as String? ?? '').isEmpty || (userData['bio'] as String? ?? '').isEmpty) {
        if (mounted) {
          setState(() => _applying = false);
          _showSnack('Please complete your profile (name + bio) before applying.');
        }
        return;
      }

      // Block if user has overdue commissions (older than 3 days or past due_date)
      final threeDaysAgo = DateTime.now().subtract(const Duration(days: 3)).toIso8601String();
      final now = DateTime.now().toIso8601String();
      final overdueData = await supabase
          .from('commissions')
          .select('id')
          .eq('worker_id', uid)
          .eq('status', 'pending')
          .or('due_date.lte.$now,and(due_date.is.null,created_at.lte.$threeDaysAgo)')
          .limit(1);
      if ((overdueData as List).isNotEmpty) {
        if (mounted) {
          setState(() => _applying = false);
          _showSnack('You have unpaid platform commission. Please pay it on the Commission page before applying for gigs.', isError: true);
        }
        return;
      }

      await supabase.from('applications').insert({
        'gig_id': _selectedGig!['id'],
        'worker_id': uid,
        'status': 'pending',
      });
      if (mounted) setState(() { _applied = true; _applying = false; });
    } catch (e) {
      if (mounted) {
        setState(() => _applying = false);
        final msg = e.toString().toLowerCase().contains('duplicate') || e.toString().toLowerCase().contains('unique')
            ? 'You already applied for this gig!'
            : 'Error applying. Please try again.';
        _showSnack(msg, isError: true);
      }
    }
  }

  void _showSnack(String msg, {bool isError = false, bool isSuccess = false}) {
    primaSnack(context, msg, isError: isError, isSuccess: isSuccess);
  }

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  List<Map<String, dynamic>> get _filtered {
    List<Map<String, dynamic>> base;
    if (_catFilter == 'All') {
      base = _gigs;
    } else {
      try {
        final cat = _kCats.firstWhere((c) => c.group == _catFilter);
        base = _gigs.where((g) => cat.fields.contains(g['field'])).toList();
      } catch (_) { base = _gigs; }
    }
    if (_radiusKm != null && _userPos != null) {
      base = base.where((g) {
        final lat = (g['latitude'] as num?)?.toDouble();
        final lng = (g['longitude'] as num?)?.toDouble();
        if (lat == null || lng == null) return true;
        final m = Geolocator.distanceBetween(_userPos!.latitude, _userPos!.longitude, lat, lng);
        return (m / 1000) <= _radiusKm!;
      }).toList();
    }
    if (_searchQuery.isEmpty) return base;
    final q = _searchQuery.toLowerCase();
    return base.where((g) {
      return (g['title'] as String? ?? '').toLowerCase().contains(q) ||
          (g['description'] as String? ?? '').toLowerCase().contains(q) ||
          (g['field'] as String? ?? '').toLowerCase().contains(q) ||
          (g['location'] as String? ?? '').toLowerCase().contains(q);
    }).toList();
  }

  // ─── Build ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final pad = MediaQuery.of(context).padding;
    return Scaffold(
      body: Stack(
        children: [
          Column(
            children: [
              Expanded(child: _buildMap(pad)),
              _buildHappeningNow(),
            ],
          ),
          if (_selectedGig != null) _buildDetailOverlay(),
          if (_toast != null)
            Positioned(
              left: 24, right: 24, bottom: 100,
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  decoration: BoxDecoration(color: _dark, borderRadius: BorderRadius.circular(12),
                    boxShadow: const [BoxShadow(color: Color(0x44000000), blurRadius: 12)]),
                  child: Text(_toast!, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700)),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildMap(EdgeInsets pad) {
    return Stack(
      children: [
        FlutterMap(
          mapController: _mapCtrl,
          options: MapOptions(
            initialCenter: _userPos ?? const LatLng(6.5244, 3.3792),
            initialZoom: 13,
            maxZoom: 19,
            interactionOptions: const InteractionOptions(
              flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
            ),
            onMapEvent: (event) {
              if (event is MapEventMoveEnd && mounted) {
                setState(() => _zoom = _mapCtrl.camera.zoom);
              }
            },
          ),
          children: [
            TileLayer(
              urlTemplate: AppConfig.cartoTileUrl(dark: _darkMap),
              subdomains: const ['a', 'b', 'c', 'd'],
              userAgentPackageName: 'com.primaplug.prima_app',
              maxZoom: 19,
            ),
            if (_userPos != null)
              MarkerLayer(markers: [
                Marker(point: _userPos!, width: 40, height: 40, child: const _PulsingDot()),
              ]),
            // Zoom-aware clustering
            Builder(builder: (_) {
              final precision = (_zoom - 11).clamp(1, 4).round();
              final Map<String, _Cluster> clusterMap = {};
              for (final gig in _filtered) {
                final lat = (gig['latitude'] as num?)?.toDouble();
                final lng = (gig['longitude'] as num?)?.toDouble();
                if (lat == null || lng == null) continue;
                final key = '${lat.toStringAsFixed(precision)},${lng.toStringAsFixed(precision)}';
                if (!clusterMap.containsKey(key)) {
                  clusterMap[key] = _Cluster();
                }
                clusterMap[key]!.gigs.add(gig);
                clusterMap[key]!.sumLat += lat;
                clusterMap[key]!.sumLng += lng;
              }
              return MarkerLayer(
                markers: clusterMap.values.map((cluster) {
                  if (cluster.gigs.length == 1) {
                    final gig = cluster.gigs.first;
                    final lat = (gig['latitude'] as num?)!.toDouble();
                    final lng = (gig['longitude'] as num?)!.toDouble();
                    return Marker(
                      point: LatLng(lat, lng),
                      width: 82, height: 76,
                      child: GestureDetector(
                        onTap: () {
                          if (_sheetCtrl.isAttached) _sheetCtrl.jumpTo(0.88);
                          setState(() { _selectedGig = gig; _applied = false; _applying = false; });
                        },
                        child: _buildGigMarker(gig),
                      ),
                    );
                  }
                  return Marker(
                    point: LatLng(cluster.lat, cluster.lng),
                    width: 58, height: 58,
                    child: GestureDetector(
                      onTap: () => _mapCtrl.move(LatLng(cluster.lat, cluster.lng), _zoom + 2),
                      child: Stack(alignment: Alignment.center, children: [
                        Container(
                          width: 58, height: 58,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: _purple.withValues(alpha: 0.15),
                          ),
                        ),
                        Container(
                          width: 44, height: 44,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            color: _purple,
                            boxShadow: [BoxShadow(color: Color(0x556C47FF), blurRadius: 12, spreadRadius: 2)],
                          ),
                          child: Center(
                            child: Text('${cluster.gigs.length}',
                              style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w800)),
                          ),
                        ),
                      ]),
                    ),
                  );
                }).toList(),
              );
            }),
          ],
        ),

        // Live stats + dark toggle — top left (right edge stops before action buttons)
        Positioned(
          top: pad.top + 14, left: 14, right: 124,
          child: Row(children: [
            _statsChip(dot: const Color(0xFFFF3366), label: '$_nowCount NOW'),
            const SizedBox(width: 8),
            _statsChip(dot: _green, label: '$_liveCount live'),
            const Spacer(),
            GestureDetector(
              onTap: () => setState(() => _darkMap = !_darkMap),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                decoration: BoxDecoration(
                  color: _darkMap ? _purple.withValues(alpha: 0.92) : Colors.white.withValues(alpha: 0.92),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: _darkMap ? const Color(0xFF9B59FF) : const Color(0x336C47FF)),
                  boxShadow: const [BoxShadow(color: Color(0x22000000), blurRadius: 10, offset: Offset(0, 2))],
                ),
                child: Text(
                  _darkMap ? '☀️ Light' : '🌙 Dark',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                      color: _darkMap ? Colors.white : const Color(0xFF8B8FAF)),
                ),
              ),
            ),
          ]),
        ),

        // Action buttons — top right
        Positioned(
          top: pad.top + 10, right: 12,
          child: Row(children: [
            _mapIconBtn(Icons.notifications_outlined, () => context.push('/notifications')),
            const SizedBox(width: 6),
            _mapHamburger(),
          ]),
        ),

        // Category filter chips
        Positioned(
          top: pad.top + 58, left: 0, right: 0,
          child: SizedBox(
            height: 36,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              children: [
                _catChip('All', '✦ All', null),
                ..._kCats.map((cat) => _catChip(cat.group, '${cat.icon} ${cat.group}', cat)),
              ],
            ),
          ),
        ),

        // Radius filter chips
        Positioned(
          top: pad.top + 98, left: 14,
          child: Row(
            children: [null, 5, 10, 25].map((km) => _radiusChip(km)).toList(),
          ),
        ),

        // My location FAB
        Positioned(
          right: 16, bottom: 16,
          child: FloatingActionButton.small(
            heroTag: 'mapLoc',
            backgroundColor: Colors.white,
            onPressed: () { if (_userPos != null) try { _mapCtrl.move(_userPos!, 14); } catch (_) {} },
            child: const Icon(Icons.my_location, color: _purple),
          ),
        ),

        if (_loading)
          const Center(child: PrimaLoader()),
      ],
    );
  }

  Widget _mapIconBtn(IconData icon, VoidCallback onTap, {bool filled = false}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 46, height: 46,
        decoration: BoxDecoration(
          color: filled ? _purple : Colors.white,
          borderRadius: BorderRadius.circular(14),
          boxShadow: const [BoxShadow(color: Color(0x22000000), blurRadius: 12, offset: Offset(0, 3))],
        ),
        child: Icon(icon, color: filled ? Colors.white : _purple, size: 22),
      ),
    );
  }

  Widget _statsChip({required Color dot, required String label}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xE00D1B3E),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 7, height: 7, decoration: BoxDecoration(shape: BoxShape.circle, color: dot)),
        const SizedBox(width: 6),
        Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white)),
      ]),
    );
  }

  Widget _catChip(String id, String label, _Cat? cat) {
    final active = _catFilter == id;
    return GestureDetector(
      onTap: () => setState(() => _catFilter = active ? 'All' : id),
      child: Container(
        margin: const EdgeInsets.only(right: 7),
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 5),
        decoration: BoxDecoration(
          color: active
              ? (cat != null ? cat.color.withValues(alpha: 0.92) : _purple.withValues(alpha: 0.95))
              : const Color(0xD00D1B3E),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: active ? (cat?.color ?? _purple) : Colors.white.withValues(alpha: 0.18)),
        ),
        child: Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white), maxLines: 1),
      ),
    );
  }

  Widget _radiusChip(int? km) {
    final active = _radiusKm == km;
    return GestureDetector(
      onTap: () => setState(() => _radiusKm = active ? null : km),
      child: Container(
        margin: const EdgeInsets.only(right: 6),
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 4),
        decoration: BoxDecoration(
          color: active ? _green.withValues(alpha: 0.9) : const Color(0xD00D1B3E),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: active ? _green : Colors.white.withValues(alpha: 0.15)),
        ),
        child: Text(
          km != null ? '${km}km' : 'Any distance',
          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white),
        ),
      ),
    );
  }

  PopupMenuItem<String> _mapMenuItem(String key, IconData icon, String label) {
    return PopupMenuItem<String>(
      value: key,
      child: Row(children: [
        Icon(icon, color: _purple, size: 20),
        const SizedBox(width: 12),
        Text(label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: _dark)),
      ]),
    );
  }

  Widget _mapHamburger() {
    return PopupMenuButton<String>(
      padding: EdgeInsets.zero,
      onSelected: (key) {
        switch (key) {
          case 'wallet':
            context.go('/wallet');
            break;
          case 'commission':
            context.push('/commission');
            break;
          case 'withdrawal':
            context.push('/withdraw-credits');
            break;
          case 'stats':
            context.push('/stats');
            break;
          case 'settings':
            context.push('/settings');
            break;
          case 'discover':
            context.push('/discover');
            break;
          case 'referral':
            context.push('/refer');
            break;
          case 'saved':
            context.push('/saved');
            break;
        }
      },
      icon: Container(
        width: 46, height: 46,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          boxShadow: const [BoxShadow(color: Color(0x22000000), blurRadius: 12, offset: Offset(0, 3))],
        ),
        child: const Icon(Icons.menu_rounded, color: _purple, size: 22),
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      offset: const Offset(0, 52),
      itemBuilder: (ctx) => [
        _mapMenuItem('discover',   Icons.explore_outlined,                appT('discover')),
        _mapMenuItem('referral',   Icons.share_outlined,                  appT('referEarn')),
        _mapMenuItem('wallet',     Icons.account_balance_wallet_outlined, 'Wallet'),
        _mapMenuItem('commission', Icons.receipt_long_outlined,           appT('commission')),
        _mapMenuItem('withdrawal', Icons.upload_outlined,                 'Withdraw Credits'),
        _mapMenuItem('saved',      Icons.bookmark_outline_rounded,        appT('saved')),
        _mapMenuItem('stats',      Icons.bar_chart_rounded,               appT('stats')),
        _mapMenuItem('settings',   Icons.settings_outlined,               appT('settings')),
      ],
    );
  }

  Widget _buildGigMarker(Map<String, dynamic> gig) {
    final urgency = gig['urgency'] as String?;
    final isDigital = gig['type'] == 'digital';
    final pinColor = isDigital ? const Color(0xFF0EA5E9) : _urgencyColor(urgency);
    final poster = gig['poster'] as Map<String, dynamic>?;
    final avatarUrl = poster?['avatar_url'] as String?;
    final name = poster?['full_name'] as String? ?? '?';
    final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Stack(
          clipBehavior: Clip.none,
          children: [
            Container(
              width: 44, height: 44,
              decoration: BoxDecoration(
                shape: BoxShape.circle, color: Colors.white,
                border: Border.all(color: pinColor, width: 3),
                boxShadow: [BoxShadow(color: pinColor.withValues(alpha: 0.4), blurRadius: 12, offset: const Offset(0, 4))],
              ),
              child: ClipOval(
                child: avatarUrl != null && avatarUrl.isNotEmpty
                    ? CachedNetworkImage(imageUrl: avatarUrl, fit: BoxFit.cover, errorWidget: (_, _, _) => _initial(initial, pinColor))
                    : _initial(initial, pinColor),
              ),
            ),
            if (isDigital)
              Positioned(
                top: -4, right: -4,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                  decoration: BoxDecoration(color: const Color(0xFF0EA5E9), borderRadius: BorderRadius.circular(4), border: Border.all(color: Colors.white, width: 1.5)),
                  child: const Text('WEB', style: TextStyle(color: Colors.white, fontSize: 7, fontWeight: FontWeight.w800)),
                ),
              ),
          ],
        ),
        CustomPaint(size: const Size(14, 9), painter: _TrianglePainter(pinColor)),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6),
            boxShadow: const [BoxShadow(color: Color(0x26000000), blurRadius: 6)]),
          child: Text(_markerLabel(gig), style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: _dark), maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
      ],
    );
  }

  Widget _initial(String c, Color color) => Center(child: Text(c, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 16)));

  // ─── HAPPENING NOW strip ──────────────────────────────────────────────────

  Widget _buildHappeningNow() {
    final filtered = _filtered;
    return Container(
      decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: Color(0xFFE2E0FF), width: 1.5))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Row(children: [
              const Text('HAPPENING NOW', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFFA09DC8), letterSpacing: 1)),
              const Spacer(),
              GestureDetector(
                onTap: () => _showAllGigsSheet(filtered),
                child: Text('See all (${filtered.length}) →', style: const TextStyle(fontSize: 11, color: _purple, fontWeight: FontWeight.w600)),
              ),
            ]),
          ),
          if (filtered.isEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Text(
                _gigs.isEmpty ? 'No live gigs yet — be the first to post one! 🚀' : 'No gigs in this category nearby',
                style: const TextStyle(fontSize: 13, color: Color(0xFFA09DC8)),
              ),
            )
          else
            SizedBox(
              height: 106,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                itemCount: min(8, filtered.length),
                itemBuilder: (_, i) => _buildNowCard(filtered[i]),
              ),
            ),
        ],
      ),
    );
  }

  void _showAllGigsSheet(List<Map<String, dynamic>> gigs) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.75,
        minChildSize: 0.4,
        maxChildSize: 0.95,
        builder: (_, controller) => Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
          ),
          child: Column(children: [
            const SizedBox(height: 12),
            Container(width: 40, height: 4, decoration: BoxDecoration(color: const Color(0xFFE2E0FF), borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(children: [
                const Expanded(
                  child: Text('All Nearby Gigs', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: _dark)),
                ),
                Text('${gigs.length} gig${gigs.length != 1 ? "s" : ""}',
                  style: const TextStyle(fontSize: 12, color: Color(0xFFA09DC8))),
              ]),
            ),
            const SizedBox(height: 8),
            const Divider(height: 1, color: Color(0xFFF5F4FF)),
            Expanded(
              child: gigs.isEmpty
                  ? const Center(child: Text('No gigs match your filters', style: TextStyle(color: Color(0xFFA09DC8))))
                  : ListView.builder(
                      controller: controller,
                      padding: const EdgeInsets.all(16),
                      itemCount: gigs.length,
                      itemBuilder: (_, i) {
                        final gig = gigs[i];
                        final sym = _currencySymbol(gig['currency'] as String?);
                        final uc = _urgencyColor(gig['urgency'] as String?);
                        return GestureDetector(
                          onTap: () {
                            Navigator.pop(context);
                            if (_sheetCtrl.isAttached) _sheetCtrl.jumpTo(0.88);
                            setState(() { _selectedGig = gig; _applied = false; _applying = false; });
                          },
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: const Color(0xFFF5F4FF),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: const Color(0xFFE2E0FF), width: 1.5),
                            ),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Row(children: [
                                Expanded(child: Text(gig['title'] ?? '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _dark), maxLines: 1, overflow: TextOverflow.ellipsis)),
                                const SizedBox(width: 10),
                                Text('$sym${_fmtPay(gig['pay_min'])}–$sym${_fmtPay(gig['pay_max'])}',
                                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: _green)),
                              ]),
                              const SizedBox(height: 6),
                              Row(children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: _urgencyBg(gig['urgency'] as String?),
                                    borderRadius: BorderRadius.circular(4),
                                    border: Border.all(color: uc.withValues(alpha: 0.45)),
                                  ),
                                  child: Text((gig['urgency'] ?? 'FLEXIBLE').toUpperCase(),
                                    style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: uc, letterSpacing: 0.8)),
                                ),
                                if (gig['type'] == 'digital') ...[
                                  const SizedBox(width: 8),
                                  const Text('REMOTE', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: Color(0xFF0EA5E9))),
                                ],
                                if (gig['field'] != null) ...[
                                  const SizedBox(width: 8),
                                  Expanded(child: Text(gig['field'] as String,
                                    style: const TextStyle(fontSize: 10, color: Color(0xFF8B8FAF)), maxLines: 1, overflow: TextOverflow.ellipsis)),
                                ],
                              ]),
                            ]),
                          ),
                        );
                      },
                    ),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _buildNowCard(Map<String, dynamic> gig) {
    final urgency = gig['urgency'] as String?;
    final isDigital = gig['type'] == 'digital';
    final uc = _urgencyColor(urgency);
    final sym = _currencySymbol(gig['currency'] as String?);

    String? distLabel;
    if (!isDigital && _userPos != null) {
      final lat = (gig['latitude'] as num?)?.toDouble();
      final lng = (gig['longitude'] as num?)?.toDouble();
      if (lat != null && lng != null) {
        final m = Geolocator.distanceBetween(_userPos!.latitude, _userPos!.longitude, lat, lng);
        distLabel = m < 1000 ? '${m.toStringAsFixed(0)}m' : '${(m / 1000).toStringAsFixed(1)}km';
      }
    }

    return GestureDetector(
      onTap: () {
        if (_sheetCtrl.isAttached) _sheetCtrl.jumpTo(0.88);
        setState(() { _selectedGig = gig; _applied = false; _applying = false; });
      },
      child: Container(
        width: 190, margin: const EdgeInsets.only(right: 12),
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(
          color: const Color(0xFFF5F4FF), borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFE2E0FF), width: 1.5),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Row(children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: _urgencyBg(urgency), borderRadius: BorderRadius.circular(4),
                border: Border.all(color: uc.withValues(alpha: 0.45)),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                if (urgency == 'now') ...[
                  Container(width: 4, height: 4, decoration: BoxDecoration(shape: BoxShape.circle, color: uc)),
                  const SizedBox(width: 3),
                ],
                Text((urgency ?? 'FLEXIBLE').toUpperCase(), style: TextStyle(fontSize: 8, fontWeight: FontWeight.w800, color: uc, letterSpacing: 0.8)),
              ]),
            ),
            if (isDigital) ...[
              const Spacer(),
              const Text('REMOTE', style: TextStyle(fontSize: 8, fontWeight: FontWeight.w800, color: Color(0xFF0EA5E9))),
            ],
          ]),
          const SizedBox(height: 6),
          Flexible(child: Text(gig['title'] ?? '', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _dark), maxLines: 2, overflow: TextOverflow.ellipsis)),
          const SizedBox(height: 4),
          Text('$sym${_fmtPay(gig['pay_min'])}–$sym${_fmtPay(gig['pay_max'])}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: _green)),
          if (distLabel != null) ...[
            const SizedBox(height: 3),
            Text('$distLabel away', style: const TextStyle(fontSize: 11, color: _muted)),
          ],
        ]),
      ),
    );
  }

  // ─── Gig detail overlay ───────────────────────────────────────────────────

  Widget _buildDetailOverlay() {
    return GestureDetector(
      onTap: () => setState(() { _selectedGig = null; _applied = false; }),
      child: Container(
        color: const Color(0xBF14123A),
        child: DraggableScrollableSheet(
          controller: _sheetCtrl,
          initialChildSize: 0.88,
          minChildSize: 0.08,
          maxChildSize: 0.95,
          expand: true,
          builder: (ctx, scrollCtrl) => GestureDetector(
            onTap: () {},
            child: Container(
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
              ),
              child: Column(children: [
                // Drag handle row — tap X or drag down to close
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
                  child: Stack(alignment: Alignment.center, children: [
                    Container(width: 40, height: 4, decoration: BoxDecoration(color: const Color(0xFFE2E0FF), borderRadius: BorderRadius.circular(2))),
                    Positioned(
                      right: 0,
                      child: GestureDetector(
                        onTap: () => setState(() { _selectedGig = null; _applied = false; }),
                        child: Container(
                          width: 32, height: 32,
                          decoration: BoxDecoration(color: const Color(0xFFF5F4FF), shape: BoxShape.circle, border: Border.all(color: const Color(0xFFE2E0FF), width: 1.5)),
                          child: const Icon(Icons.close, size: 16, color: Color(0xFF8B8FAF)),
                        ),
                      ),
                    ),
                  ]),
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: SingleChildScrollView(
                    controller: scrollCtrl,
                    padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
                    child: _applied ? _buildAppliedContent() : _buildDetailContent(),
                  ),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAppliedContent() {
    final gig = _selectedGig!;
    final poster = gig['poster'] as Map<String, dynamic>?;
    final phone = poster?['phone'] as String?;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const SizedBox(height: 16),
      const Icon(Icons.check_circle, color: _purple, size: 64),
      const SizedBox(height: 12),
      const Text('Application Sent!', textAlign: TextAlign.center, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: _purple)),
      const SizedBox(height: 8),
      const Text(
        'The client will review and confirm your application.\nOnce accepted you\'ll see the exact address.',
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 13, color: Color(0xFF8B8FAF), height: 1.6),
      ),
      if (gig['house_number'] != null || gig['street'] != null || gig['landmark'] != null) ...[
        const SizedBox(height: 20),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: const LinearGradient(colors: [Color(0xFFEEE9FF), Color(0xFFF8F5FF)]),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFB8A5FF), width: 1.5),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('EXACT ADDRESS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: _purple, letterSpacing: 0.8)),
            const SizedBox(height: 12),
            if (gig['house_number'] != null) _addrRow('Building', gig['house_number'].toString()),
            if (gig['street'] != null) _addrRow('Street', gig['street'].toString()),
            if (gig['landmark'] != null) _addrRow('Landmark', gig['landmark'].toString()),
            if (gig['directions'] != null) _addrRow('Directions', gig['directions'].toString()),
            if (gig['latitude'] != null) ...[
              const SizedBox(height: 10),
              GestureDetector(
                onTap: () {
                  final lat = double.tryParse(gig['latitude'].toString());
                  final lng = double.tryParse(gig['longitude'].toString());
                  if (lat != null && lng != null) {
                    setState(() { _selectedGig = null; _applied = false; });
                    _mapCtrl.move(LatLng(lat, lng), 17.0);
                  }
                },
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFB8A5FF), width: 1.5)),
                  child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Icon(Icons.map_outlined, color: _purple, size: 18),
                    SizedBox(width: 8),
                    Text('Show on Map', style: TextStyle(color: _purple, fontWeight: FontWeight.w700, fontSize: 13)),
                  ]),
                ),
              ),
              const SizedBox(height: 8),
              GestureDetector(
                onTap: () {
                  final lat = double.tryParse(gig['latitude'].toString());
                  final lng = double.tryParse(gig['longitude'].toString());
                  if (lat != null && lng != null) {
                    _launchUrl('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng');
                  }
                },
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: const Color(0xFF4285F4), borderRadius: BorderRadius.circular(10)),
                  child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Icon(Icons.directions_rounded, color: Colors.white, size: 18),
                    SizedBox(width: 8),
                    Text('Get Directions', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13)),
                  ]),
                ),
              ),
            ],
          ]),
        ),
      ],
      if (phone != null && phone.isNotEmpty) ...[
        const SizedBox(height: 12),
        GestureDetector(
          onTap: () {
            final clean = phone.replaceAll(RegExp(r'\D'), '');
            final title = Uri.encodeComponent(gig['title']?.toString() ?? 'your gig');
            _launchUrl('https://wa.me/$clean?text=Hi%2C+I+just+applied+for+your+gig+"$title"+on+Prima');
          },
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: const Color(0xFF25D366), borderRadius: BorderRadius.circular(12)),
            child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(Icons.chat_bubble_outline, color: Colors.white, size: 20),
              SizedBox(width: 8),
              Text('Message on WhatsApp', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14)),
            ]),
          ),
        ),
      ],
    ]);
  }

  Widget _addrRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 70, child: Text(label.toUpperCase(), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFFA09DC8), letterSpacing: 0.6))),
        Expanded(child: Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _dark))),
      ]),
    );
  }

  Future<void> _openChatWithPoster(String posterId, String gigId) async {
    final me = Supabase.instance.client.auth.currentUser;
    if (me == null || posterId.isEmpty) return;
    final sb = Supabase.instance.client;
    try {
      final data = await sb
        .from('conversations')
        .select('id')
        .or(
          'and(participant_1.eq.${me.id},participant_2.eq.$posterId),'
          'and(participant_1.eq.$posterId,participant_2.eq.${me.id})',
        )
        .order('last_message_at', ascending: false)
        .limit(1);
      final list = (data as List).cast<Map<String, dynamic>>();
      String? convoId = list.isNotEmpty ? list.first['id'] as String? : null;
      if (convoId == null) {
        final created = await sb.from('conversations').insert({
          'gig_id': null,
          'participant_1': me.id,
          'participant_2': posterId,
          'last_message': '',
          'last_message_at': DateTime.now().toIso8601String(),
        }).select('id').single();
        convoId = created['id'] as String?;
      }
      if (convoId != null && mounted) {
        setState(() { _selectedGig = null; _applied = false; });
        context.push('/chat/$convoId');
      }
    } catch (_) {
      if (mounted) _showSnack('Could not open chat', isError: true);
    }
  }

  void _shareGig(Map<String, dynamic> gig) {
    final title = gig['title'] as String? ?? 'a gig';
    final location = gig['location'] as String? ?? 'Remote';
    final payMin = _fmtPay(gig['pay_min']);
    final payMax = _fmtPay(gig['pay_max']);
    final sym = _currencySymbol(gig['currency'] as String?);
    final gigId = gig['id'] as String? ?? '';
    final text = '🔥 Check out this gig on PrimaPlug!\n\n$title\n💰 $sym$payMin–$sym$payMax\n📍 $location\n\nApply here: https://primaplug.com/?gigref=$gigId';
    Share.share(text, subject: title);
  }

  void _showPosterProfile(Map<String, dynamic> gig) {
    final posterId = gig['poster_id'] as String? ?? (gig['poster'] as Map?)?['id'] as String?;
    if (posterId == null || posterId.isEmpty) return;
    context.push('/user/$posterId');
  }


  Widget _buildDetailContent() {
    final gig = _selectedGig!;
    final poster = gig['poster'] as Map<String, dynamic>?;
    final urgency = gig['urgency'] as String?;
    final uc = _urgencyColor(urgency);
    final ub = _urgencyBg(urgency);
    final isDigital = gig['type'] == 'digital';
    final sym = _currencySymbol(gig['currency'] as String?);
    final isWallet = gig['payment_method'] == 'wallet';
    final gigId = gig['id'].toString();
    final isSaved = _savedIds.contains(gigId);
    final avatarUrl = poster?['avatar_url'] as String?;
    final name = poster?['full_name'] as String? ?? 'Anonymous';
    final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      // Poster row
      GestureDetector(
        onTap: () => _showPosterProfile(gig),
        child: Row(children: [
        Container(
          width: 52, height: 52,
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), color: const Color(0xFFEEE9FF)),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: avatarUrl != null && avatarUrl.isNotEmpty
                ? CachedNetworkImage(imageUrl: avatarUrl, fit: BoxFit.cover, errorWidget: (_, _a, _b) => _initial(initial, _purple))
                : _initial(initial, _purple),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: _dark)),
          Text(
            '⭐ ${poster?['rating'] ?? 5.0} · ${poster?['gigs_completed'] ?? 0} gigs · Trust ${poster?['trust_score'] ?? 100}%',
            style: const TextStyle(fontSize: 11, color: Color(0xFF8B8FAF)),
          ),
        ])),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(color: ub, borderRadius: BorderRadius.circular(6), border: Border.all(color: uc.withValues(alpha: 0.4))),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              if (urgency == 'now') ...[Container(width: 5, height: 5, decoration: BoxDecoration(shape: BoxShape.circle, color: uc)), const SizedBox(width: 4)],
              Text((urgency ?? 'FLEXIBLE').toUpperCase(), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: uc, letterSpacing: 0.8)),
            ]),
          ),
          if ((gig['slots'] as int? ?? 1) > 1) ...[
            const SizedBox(height: 5),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
              decoration: BoxDecoration(color: const Color(0xFFDFFDF4), borderRadius: BorderRadius.circular(6), border: Border.all(color: const Color(0xFF7EECD2))),
              child: Text('${gig['slots']} OPEN SLOTS', style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: _green)),
            ),
          ],
        ]),
      ])),
      const SizedBox(height: 16),

      // Title
      Text(gig['title'] ?? '', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: _dark, height: 1.3)),
      const SizedBox(height: 8),
      Row(children: [
        Text('Posted ${_timeAgo(gig['created_at'] as String?)}', style: const TextStyle(fontSize: 11, color: Color(0xFFA09DC8))),
        if (gig['expires_at'] == null) const Text(' · Open-ended', style: TextStyle(fontSize: 11, color: Color(0xFFA09DC8))),
      ]),
      const SizedBox(height: 14),

      // Pay + Location grid
      Row(children: [
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Color(0xFFE8FFE4), Color(0xFFDFFDF4)]),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFF7EECD2), width: 1.5),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('PAY RANGE', style: TextStyle(fontSize: 9, color: _green, fontWeight: FontWeight.w700, letterSpacing: 0.8)),
              const SizedBox(height: 4),
              Text('$sym${_fmtPay(gig['pay_min'])}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: _green)),
              Text('up to $sym${_fmtPay(gig['pay_max'])}', style: const TextStyle(fontSize: 11, color: _green)),
            ]),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: isDigital ? const Color(0xFFE0F2FE) : const Color(0xFFFFF0E8),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: isDigital ? const Color(0xFF7DD3FC) : const Color(0xFFFFBC99), width: 1.5),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(isDigital ? 'REMOTE WORK' : 'LOCATION',
                style: TextStyle(fontSize: 9, color: isDigital ? const Color(0xFF0EA5E9) : const Color(0xFFFF6B2B), fontWeight: FontWeight.w700, letterSpacing: 0.8)),
              const SizedBox(height: 4),
              Text(
                isDigital ? 'Online / Remote' : (gig['location'] as String? ?? 'See details'),
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _dark, height: 1.3),
                maxLines: 2, overflow: TextOverflow.ellipsis,
              ),
              if (!isDigital && _userPos != null) Builder(builder: (_) {
                final lat = (gig['latitude'] as num?)?.toDouble();
                final lng = (gig['longitude'] as num?)?.toDouble();
                if (lat == null || lng == null) return const SizedBox.shrink();
                final m = Geolocator.distanceBetween(_userPos!.latitude, _userPos!.longitude, lat, lng);
                final dist = m < 1000 ? '${m.toStringAsFixed(0)}m away' : '${(m / 1000).toStringAsFixed(1)}km away';
                return Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(dist, style: const TextStyle(fontSize: 11, color: Color(0xFFFF6B2B), fontWeight: FontWeight.w600)),
                );
              }),
            ]),
          ),
        ),
      ]),

      // Address / Location section (always shown for physical gigs)
      if (!isDigital) ...[
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: const Color(0xFFFFF8F0), borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFFFBC99), width: 1.5)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.location_on, color: Color(0xFFFF6B2B), size: 22),
              const SizedBox(width: 8),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('LOCATION', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: Color(0xFFFF6B2B), letterSpacing: 0.8)),
                const SizedBox(height: 4),
                if (gig['location'] != null && (gig['location'] as String).isNotEmpty)
                  Text(gig['location'].toString(), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _dark))
                else if (gig['house_number'] != null || gig['street'] != null)
                  Text('${gig['house_number'] ?? ''} ${gig['street'] ?? ''}'.trim(), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _dark))
                else
                  const Text('Apply to reveal full address', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF8B8FAF))),
                if (gig['landmark'] != null) ...[
                  const SizedBox(height: 2),
                  Text('Near ${gig['landmark']}', style: const TextStyle(fontSize: 12, color: Color(0xFF8B8FAF))),
                ],
              ])),
            ]),
            if (gig['latitude'] != null) ...[
              const SizedBox(height: 10),
              Row(children: [
                Expanded(
                  child: GestureDetector(
                    onTap: () {
                      final lat = double.tryParse(gig['latitude'].toString());
                      final lng = double.tryParse(gig['longitude'].toString());
                      if (lat != null && lng != null) {
                        setState(() { _selectedGig = null; _applied = false; });
                        _mapCtrl.move(LatLng(lat, lng), 17.0);
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFFFBC99), width: 1.5)),
                      child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Icon(Icons.map_outlined, color: Color(0xFFFF6B2B), size: 16),
                        SizedBox(width: 6),
                        Text('Show on Map', style: TextStyle(color: Color(0xFFFF6B2B), fontWeight: FontWeight.w700, fontSize: 12)),
                      ]),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: GestureDetector(
                    onTap: () {
                      final lat = double.tryParse(gig['latitude'].toString());
                      final lng = double.tryParse(gig['longitude'].toString());
                      if (lat != null && lng != null) {
                        _launchUrl('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng');
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      decoration: BoxDecoration(color: const Color(0xFF4285F4), borderRadius: BorderRadius.circular(8)),
                      child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Icon(Icons.directions_rounded, color: Colors.white, size: 16),
                        SizedBox(width: 6),
                        Text('Directions', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12)),
                      ]),
                    ),
                  ),
                ),
              ]),
            ],
          ]),
        ),
      ],

      // Description
      if (gig['description'] != null && (gig['description'] as String).isNotEmpty) ...[
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: const Color(0xFFF5F4FF), borderRadius: BorderRadius.circular(12)),
          child: Text(gig['description'].toString(), style: const TextStyle(fontSize: 13, color: Color(0xFF5B5887), height: 1.6)),
        ),
      ],

      // Payment protection notice
      const SizedBox(height: 14),
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isWallet ? const Color(0xFFDFFDF4) : const Color(0xFFEEE9FF),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: isWallet ? const Color(0xFF7EECD2) : const Color(0xFFB8A5FF), width: 1.5),
        ),
        child: Row(children: [
          Icon(isWallet ? Icons.lock : Icons.shield_outlined, color: isWallet ? _green : _purple, size: 28),
          const SizedBox(width: 10),
          Expanded(child: Text(
            isWallet
                ? 'Payment is already secured in escrow. You\'ll receive it automatically once the work is confirmed complete.'
                : 'Both parties confirm completion by uploading receipts. No payment platform needed — direct and protected.',
            style: TextStyle(fontSize: 12, color: isWallet ? const Color(0xFF00A878) : _purple, height: 1.6),
          )),
        ]),
      ),
      const SizedBox(height: 14),

      // Save + Share
      Row(children: [
        Expanded(
          child: OutlinedButton.icon(
            onPressed: () => _toggleSave(gig),
            icon: Icon(isSaved ? Icons.bookmark_rounded : Icons.bookmark_border_rounded, size: 17),
            label: Text(isSaved ? 'Saved' : 'Save', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
            style: OutlinedButton.styleFrom(
              foregroundColor: isSaved ? _purple : const Color(0xFF8B8FAF),
              backgroundColor: isSaved ? const Color(0xFFEEE9FF) : null,
              side: BorderSide(color: isSaved ? const Color(0xFFB8A5FF) : const Color(0xFFE2E0FF), width: 1.5),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: OutlinedButton.icon(
            onPressed: () => _shareGig(gig),
            icon: const Icon(Icons.share_rounded, size: 17),
            label: const Text('Share', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF8B8FAF),
              side: const BorderSide(color: Color(0xFFE2E0FF), width: 1.5),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
          ),
        ),
      ]),
      const SizedBox(height: 8),

      // Report
      OutlinedButton(
        onPressed: () => _showReportDialog(gig),
        style: OutlinedButton.styleFrom(
          foregroundColor: const Color(0xFFFF3366),
          backgroundColor: const Color(0xFFFFE8EE),
          side: const BorderSide(color: Color(0xFFFF99B3), width: 1.5),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          padding: const EdgeInsets.symmetric(vertical: 11),
          minimumSize: const Size.fromHeight(44),
        ),
        child: const Text('🚨  Report This Gig', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
      ),
      const SizedBox(height: 12),

      // Message + Apply
      Row(children: [
        Expanded(
          child: OutlinedButton.icon(
            onPressed: () {
              final posterId = gig['poster_id'] as String? ?? '';
              final gigId = gig['id'] as String? ?? '';
              _openChatWithPoster(posterId, gigId);
            },
            icon: const Icon(Icons.chat_bubble_outline_rounded, size: 17),
            label: const Text('Message', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
            style: OutlinedButton.styleFrom(
              foregroundColor: _purple,
              side: const BorderSide(color: Color(0xFFB8A5FF), width: 1.5),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          flex: 2,
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: _applying ? null : const LinearGradient(colors: [Color(0xFF6C47FF), Color(0xFF9B59FF)]),
              color: _applying ? const Color(0xFFB8A5FF) : null,
              borderRadius: BorderRadius.circular(14),
              boxShadow: _applying ? null : const [BoxShadow(color: Color(0x446C47FF), blurRadius: 12, offset: Offset(0, 4))],
            ),
            child: ElevatedButton.icon(
              onPressed: _applying ? null : _applyToGig,
              icon: _applying
                  ? const SizedBox(width: 17, height: 17, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.bolt_rounded, size: 19, color: Colors.white),
              label: Text(_applying ? 'Applying...' : 'Apply Now',
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Colors.white)),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.transparent,
                shadowColor: Colors.transparent,
                disabledBackgroundColor: Colors.transparent,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
          ),
        ),
      ]),
    ]);
  }

  Future<void> _showReportDialog(Map<String, dynamic> gig) async {
    final reasons = ['Fake/Scam', 'Inappropriate content', 'Already filled', 'Wrong category', 'Other'];
    String? selected;
    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => AlertDialog(
          title: const Text('Report Gig', style: TextStyle(fontWeight: FontWeight.w800, color: _dark)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: reasons.map((r) => RadioListTile<String>(
              value: r, groupValue: selected, activeColor: _purple,
              title: Text(r, style: const TextStyle(fontSize: 14)),
              onChanged: (v) => setS(() => selected = v),
            )).toList(),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: const Color(0xFFFF3366)),
              onPressed: selected == null ? null : () async {
                Navigator.pop(ctx);
                try {
                  await supabase.from('reports').insert({
                    'reported_user_id': gig['poster_id'],
                    'gig_id': gig['id'],
                    'type': 'gig',
                    'reason': selected,
                    'reporter_id': supabase.auth.currentUser?.id,
                  });
                  if (mounted) _showSnack('Report submitted. Thank you.', isSuccess: true);
                } catch (_) {
                  if (mounted) _showSnack('Could not submit report.', isError: true);
                }
              },
              child: const Text('Report'),
            ),
          ],
        ),
      ),
    );
  }
}

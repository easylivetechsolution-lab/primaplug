import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../main.dart';
import '../widgets/brand_icon.dart';
import '../widgets/prima_loader.dart';

const _purple = Color(0xFF6C47FF);
const _green  = Color(0xFF00C48C);
const _dark   = Color(0xFF14123A);
const _muted  = Color(0xFF8B8FAF);
const _border = Color(0xFFE2E0FF);
const _bg     = Color(0xFFF8F7FF);

class _Lvl {
  final String key, label, emoji, brandIcon, desc;
  final Color color, bg, bdr;
  final int min;
  const _Lvl(this.key, this.label, this.emoji, this.brandIcon, this.color, this.bg, this.bdr, this.min, this.desc);
}

const _kLvls = [
  _Lvl('new',    'New Member', '🌱', 'profile',  Color(0xFF8B8FAF), Color(0xFFF5F4FF), Color(0xFFE2E0FF), 0,  'Just getting started on Prima'),
  _Lvl('rising', 'Rising',     '⚡', 'open',     Color(0xFFFF6B2B), Color(0xFFFFF0E8), Color(0xFFFFBC99), 3,  'Proving yourself — keep going!'),
  _Lvl('pro',    'Pro',        '🎯', 'accepted', Color(0xFF6C47FF), Color(0xFFEEE9FF), Color(0xFFB8A5FF), 10, 'Trusted by the community'),
  _Lvl('elite',  'Elite',      '🏆', 'level',    Color(0xFFFFB800), Color(0xFFFFF8E0), Color(0xFFFFD966), 25, 'Top tier — the best of Prima'),
];

_Lvl _currentLvl(int gigs) => _kLvls.lastWhere((l) => gigs >= l.min);
_Lvl? _nextLvl(_Lvl cur) { final i = _kLvls.indexOf(cur); return i < _kLvls.length - 1 ? _kLvls[i + 1] : null; }
int _lvlPct(_Lvl cur, _Lvl? nxt, int gigs) {
  if (nxt == null) return 100;
  return ((gigs - cur.min) / (nxt.min - cur.min) * 100).round().clamp(0, 100);
}

class StatsScreen extends StatefulWidget {
  const StatsScreen({super.key});
  @override
  State<StatsScreen> createState() => _StatsScreenState();
}

class _StatsScreenState extends State<StatsScreen> {
  Map<String, dynamic>? _profile;
  int    _totalPosted   = 0;
  int    _totalApplied  = 0;
  int    _acceptedApps  = 0;
  int    _totalReviews  = 0;
  double _avgRating     = 0;
  double _totalEarned   = 0;
  double _credits       = 0;
  bool   _loading       = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    final uid = supabase.auth.currentUser?.id;
    if (uid == null) { if (mounted) setState(() => _loading = false); return; }
    try {
      final res = await Future.wait<dynamic>([
        supabase.from('users').select().eq('id', uid).single(),
        supabase.from('gigs').select('id, status').eq('poster_id', uid),
        supabase.from('applications').select('id, status').eq('worker_id', uid),
        supabase.from('reviews').select('rating').eq('reviewee_id', uid),
        supabase.from('receipts').select('amount').eq('worker_id', uid).eq('completed', true),
      ]);
      final profile      = res[0] as Map<String, dynamic>;
      final gigs         = (res[1] as List).cast<Map<String, dynamic>>();
      final applications = (res[2] as List).cast<Map<String, dynamic>>();
      final reviews      = (res[3] as List).cast<Map<String, dynamic>>();
      final receipts     = (res[4] as List).cast<Map<String, dynamic>>();

      final cnt = reviews.length;
      final avg = cnt > 0 ? reviews.fold<double>(0, (s, r) => s + ((r['rating'] as num?) ?? 0).toDouble()) / cnt : 0.0;
      final earned = receipts.fold<double>(0, (s, r) => s + ((r['amount'] as num?) ?? 0).toDouble());
      if (mounted) {
        setState(() {
          _profile      = profile;
          _credits      = ((profile['prima_credits'] as num?) ?? 0).toDouble();
          _totalPosted  = gigs.length;
          _totalApplied = applications.length;
          _acceptedApps = applications.where((a) => a['status'] == 'accepted').length;
          _totalReviews = cnt;
          _avgRating    = avg;
          _totalEarned  = earned;
          _loading      = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(backgroundColor: _bg, body: Center(child: PrimaLoader()));
    }
    final gigs      = (((_profile?['gigs_completed']) as num?) ?? 0).toInt();
    final trust     = (((_profile?['trust_score']) as num?) ?? 0).toInt();
    final cur       = _currentLvl(gigs);
    final nxt       = _nextLvl(cur);
    final progress  = _lvlPct(cur, nxt, gigs);
    final acceptPct = _totalApplied > 0 ? (_acceptedApps / _totalApplied * 100).round() : 0;

    final trustLabel = trust == 0
        ? '🌱 New — Complete gigs to build your score'
        : trust >= 95 ? '🏆 Excellent — Top Tier'
        : trust >= 80 ? '👍 Good Standing'
        : '⚠️ Needs Improvement';

    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: _dark), onPressed: () => context.pop()),
        title: const Text('My Stats', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: _dark)),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        color: _purple,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 100),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Your Prima performance overview', style: TextStyle(fontSize: 13, color: _muted)),
            const SizedBox(height: 20),

            // Trust Score Hero
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF6C47FF), Color(0xFF9B59FF), Color(0xFFFF4DCF)], stops: [0, 0.5, 1]),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(children: [
                const Text('TRUST SCORE', style: TextStyle(fontSize: 11, color: Colors.white70, letterSpacing: 1.5, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Text('$trust%', style: const TextStyle(fontSize: 56, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: -2, height: 1)),
                const SizedBox(height: 4),
                Text(trustLabel, style: const TextStyle(fontSize: 13, color: Colors.white70)),
              ]),
            ),
            const SizedBox(height: 16),

            // Level Card
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(color: cur.bg, border: Border.all(color: cur.bdr, width: 1.5), borderRadius: BorderRadius.circular(16)),
              child: Column(children: [
                Row(children: [
                  Container(
                    width: 52, height: 52,
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), boxShadow: [BoxShadow(color: cur.color.withAlpha(51), blurRadius: 16, offset: const Offset(0, 4))]),
                    child: Center(child: Text(cur.emoji, style: const TextStyle(fontSize: 26))),
                  ),
                  const SizedBox(width: 12),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('CURRENT LEVEL', style: TextStyle(fontSize: 10, color: cur.color, fontWeight: FontWeight.w700, letterSpacing: 1)),
                    Text(cur.label, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: _dark)),
                    Text(cur.desc, style: const TextStyle(fontSize: 11, color: _muted)),
                  ])),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(color: cur.color, borderRadius: BorderRadius.circular(10)),
                    child: Text('$gigs gigs', style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w800)),
                  ),
                ]),
                const SizedBox(height: 14),
                if (nxt != null) ...[
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                    Text('Progress to ${nxt.label}', style: const TextStyle(fontSize: 11, color: _muted)),
                    Text('$progress%', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: cur.color)),
                  ]),
                  const SizedBox(height: 6),
                  ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: progress / 100, backgroundColor: Colors.white60, color: cur.color, minHeight: 8)),
                  const SizedBox(height: 8),
                  Row(children: [
                    Text(nxt.emoji, style: const TextStyle(fontSize: 14)),
                    const SizedBox(width: 6),
                    Text(
                      nxt.min - gigs > 0 ? '${nxt.min - gigs} more gigs to reach ${nxt.label}' : 'Ready to level up to ${nxt.label}!',
                      style: const TextStyle(fontSize: 11, color: _muted),
                    ),
                  ]),
                ] else
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(color: const Color(0xFFFFF8E0).withAlpha(100), borderRadius: BorderRadius.circular(10)),
                    child: const Center(child: Text("🏆 You've reached the highest level!", style: TextStyle(fontSize: 12, color: Color(0xFFFFB800), fontWeight: FontWeight.w600))),
                  ),
              ]),
            ),
            const SizedBox(height: 16),

            // Stats Grid — 9 tiles
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 2,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: 1.25,
              children: [
                _tile('₦${_totalEarned.toStringAsFixed(0)}', 'Total Earned', _green, null, '💰'),
                _tile('$gigs', 'Gigs Completed', _purple, 'completed', null),
                _tile(_avgRating > 0 ? '${_avgRating.toStringAsFixed(1)}★' : '0.0★', 'Avg Rating', const Color(0xFFFFB800), 'rating', null),
                _tile('$_totalReviews', 'Reviews', const Color(0xFFFF4DCF), 'reviews', null),
                _tile('$_totalPosted', 'Gigs Posted', const Color(0xFFFF6B2B), 'mygigs', null),
                _tile('$_totalApplied', 'Applied To', const Color(0xFF0EA5E9), 'applied', null),
                _tile('$_acceptedApps', 'Accepted', _green, 'accepted', null),
                _tile('$trust%', 'Trust Score', _purple, 'level', null),
                _tile(_credits.toStringAsFixed(0), 'Prima Credits', const Color(0xFFFFB800), 'credits', null),
              ],
            ),
            const SizedBox(height: 16),

            // Acceptance Rate
            if (_totalApplied > 0) ...[
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: Colors.white, border: Border.all(color: _border, width: 1.5), borderRadius: BorderRadius.circular(14)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Application Success Rate', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _dark)),
                  const SizedBox(height: 10),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: acceptPct / 100,
                      backgroundColor: const Color(0xFFF5F4FF),
                      minHeight: 8,
                      valueColor: const AlwaysStoppedAnimation<Color>(_purple),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                    Text('$_acceptedApps accepted', style: const TextStyle(fontSize: 11, color: _muted)),
                    Text('$acceptPct%', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _purple)),
                  ]),
                ]),
              ),
              const SizedBox(height: 16),
            ],

            // Level Roadmap
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(color: Colors.white, border: Border.all(color: _border, width: 1.5), borderRadius: BorderRadius.circular(16)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Level Roadmap', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _dark)),
                const SizedBox(height: 16),
                ..._kLvls.asMap().entries.map((e) {
                  final i     = e.key;
                  final lvl   = e.value;
                  final curIdx = _kLvls.indexOf(cur);
                  final isActive = lvl.key == cur.key;
                  final isDone   = curIdx > i;
                  return Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(border: Border(bottom: i < _kLvls.length - 1 ? const BorderSide(color: Color(0xFFF5F4FF)) : BorderSide.none)),
                    child: Row(children: [
                      Container(
                        width: 40, height: 40,
                        decoration: BoxDecoration(
                          color: isActive || isDone ? lvl.bg : const Color(0xFFF5F4FF),
                          border: Border.all(color: isActive || isDone ? lvl.bdr : _border, width: 1.5),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Center(child: BrandIcon(name: lvl.brandIcon, size: 28, active: isActive || isDone)),
                      ),
                      const SizedBox(width: 12),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                          Text(lvl.label, style: TextStyle(fontSize: 13, fontWeight: isActive ? FontWeight.w700 : FontWeight.w500, color: isActive ? lvl.color : isDone ? _dark : _muted)),
                          Text('${lvl.min}+ gigs', style: const TextStyle(fontSize: 11, color: _muted)),
                        ]),
                        Text(lvl.desc, style: const TextStyle(fontSize: 11, color: _muted)),
                        if (isActive) ...[
                          const SizedBox(height: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(color: lvl.bg, border: Border.all(color: lvl.bdr), borderRadius: BorderRadius.circular(20)),
                            child: Text('← You are here', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: lvl.color)),
                          ),
                        ],
                      ])),
                      if (isDone) Container(
                        width: 24, height: 24,
                        decoration: BoxDecoration(color: const Color(0xFFDFFDF4), border: Border.all(color: const Color(0xFF7EECD2), width: 1.5), shape: BoxShape.circle),
                        child: const Center(child: Text('✓', style: TextStyle(fontSize: 12, color: _green, fontWeight: FontWeight.w700))),
                      ),
                    ]),
                  );
                }),
              ]),
            ),
          ]),
        ),
      ),
    );
  }

  static Widget _tile(String val, String label, Color color, String? icon, String? emoji) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(color: Colors.white, border: Border.all(color: _border, width: 1.5), borderRadius: BorderRadius.circular(14)),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
      if (emoji != null)
        Text(emoji, style: const TextStyle(fontSize: 22))
      else if (icon != null)
        BrandIcon(name: icon, size: 30, active: false),
      const SizedBox(height: 8),
      Text(val, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color)),
      const SizedBox(height: 3),
      Text(label, style: const TextStyle(fontSize: 10, color: Color(0xFFA09DC8), fontWeight: FontWeight.w600, letterSpacing: 0.4)),
    ]),
  );
}

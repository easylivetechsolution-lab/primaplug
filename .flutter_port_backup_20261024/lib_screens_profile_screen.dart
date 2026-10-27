import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import '../main.dart';
import '../utils/dt.dart';
import '../widgets/brand_icon.dart';
import '../widgets/prima_loader.dart';

// ─── PALETTE ─────────────────────────────────────────────────────────────────

const _purple = Color(0xFF6C47FF);
const _green  = Color(0xFF00C48C);
const _dark   = Color(0xFF14123A);
const _muted  = Color(0xFF8B8FAF);
const _border = Color(0xFFE2E0FF);
const _bg     = Color(0xFFF8F7FF);

// ─── LEVEL DATA ──────────────────────────────────────────────────────────────

class _LvlData {
  final String key, label, icon;
  final List<Color> tone;
  final Color color, bg, bdr;
  final int min;
  const _LvlData(this.key, this.label, this.icon, this.tone, this.color, this.bg, this.bdr, this.min);
}

const _kLvls = [
  _LvlData('new',    'New Member', 'profile', [Color(0xFF8B8FAF), Color(0xFFA09DC8)], Color(0xFF8B8FAF), Color(0xFFF5F4FF), Color(0xFFE2E0FF), 0),
  _LvlData('rising', 'Rising',     'stats',   [Color(0xFFFF6B2B), Color(0xFFFF4DCF)], Color(0xFFFF6B2B), Color(0xFFFFF0E8), Color(0xFFFFBC99), 3),
  _LvlData('pro',    'Pro',        'level',   [Color(0xFF6C47FF), Color(0xFF9B59FF)], Color(0xFF6C47FF), Color(0xFFEEE9FF), Color(0xFFB8A5FF), 10),
  _LvlData('elite',  'Elite',      'rating',  [Color(0xFFFFB800), Color(0xFFFF6B2B)], Color(0xFFFFB800), Color(0xFFFFF8E0), Color(0xFFFFD966), 25),
];

_LvlData _lvlFor(int gigs) => _kLvls.lastWhere((l) => gigs >= l.min);
_LvlData? _nextLvl(_LvlData cur) { final i = _kLvls.indexOf(cur); return i < _kLvls.length - 1 ? _kLvls[i + 1] : null; }
int _lvlProgress(_LvlData cur, _LvlData? nxt, int gigs) {
  if (nxt == null) return 100;
  return ((gigs - cur.min) / (nxt.min - cur.min) * 100).round().clamp(0, 100);
}

int _nextTarget(int cur, int unit) => math.max(unit, ((cur + 1 + unit - 1) ~/ unit) * unit);

Color _ringColor(double s) => s >= 80 ? _green : s >= 50 ? const Color(0xFFFFB800) : const Color(0xFFFF6B2B);

int _profileComplete(Map<String, dynamic> p) {
  int s = 0;
  if ((p['full_name'] ?? '').toString().isNotEmpty) s += 15;
  if ((p['bio'] ?? '').toString().isNotEmpty) s += 10;
  if (p['avatar_url'] != null) s += 15;
  if ((p['location'] ?? '').toString().isNotEmpty) s += 10;
  if ((p['phone'] ?? '').toString().isNotEmpty) s += 5;
  if ((p['skills'] as List? ?? []).isNotEmpty) s += 10;
  if (p['physical_mode'] == true || p['digital_mode'] == true) s += 10;
  if ((p['portfolio_url'] ?? '').toString().isNotEmpty) s += 10;
  if ((p['social_linkedin'] ?? '').toString().isNotEmpty || (p['social_twitter'] ?? '').toString().isNotEmpty) s += 5;
  if ((p['work_experience'] ?? '').toString().isNotEmpty) s += 10;
  return s.clamp(0, 100);
}

// ─── PROFILE SCREEN ──────────────────────────────────────────────────────────

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  Map<String, dynamic>? _profile;
  int    _reviewCount   = 0;
  double _avgRating     = 0;
  double _totalEarned   = 0;
  int    _pendingCount  = 0;
  double _commOwed      = 0;
  double _credits       = 0;
  bool   _loading       = true;
  String _mode          = 'physical';
  String _activeTab     = 'about';
  // wallets: currency -> balance
  Map<String, double> _profileWallets = {};

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    final uid = supabase.auth.currentUser?.id;
    if (uid == null) { if (mounted) setState(() => _loading = false); return; }
    try {
      final res = await Future.wait<dynamic>([
        supabase.from('users').select().eq('id', uid).single(),
        supabase.from('reviews').select('rating').eq('reviewee_id', uid),
        supabase.from('receipts').select('amount').eq('worker_id', uid).eq('completed', true),
        supabase.from('wallets').select('currency, balance').eq('user_id', uid),
      ]);
      final p        = res[0] as Map<String, dynamic>;
      final reviews  = res[1] as List;
      final receipts = res[2] as List;
      final walletRows = res[3] as List;
      final cnt = reviews.length;
      final avg = cnt > 0 ? reviews.fold<double>(0, (s, r) => s + ((r['rating'] as num?) ?? 0).toDouble()) / cnt : 0.0;
      final earned = receipts.fold<double>(0, (s, r) => s + ((r['amount'] as num?) ?? 0).toDouble());
      if (mounted) {
        setState(() {
          _profile     = p;
          _reviewCount = cnt;
          _avgRating   = avg;
          _totalEarned = earned;
          _profileWallets = { for (final r in walletRows) (r as Map)['currency'] as String: ((r['balance'] as num?) ?? 0).toDouble() };
          _loading     = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    // Commissions: fetch separately so a missing table never breaks the profile
    try {
      final raw = await supabase
          .from('commissions')
          .select('id, gig_id, commission_amount, status')
          .eq('worker_id', uid)
          .order('created_at', ascending: false);
      // Deduplicate by gig_id — mirrors web uniqueCommissions logic
      final seen = <String>{};
      final unique = <Map<String, dynamic>>[];
      for (final c in (raw as List)) {
        final key = (c['gig_id'] ?? c['id']) as String;
        if (seen.add(key)) unique.add(c as Map<String, dynamic>);
      }
      final pending = unique.where((c) => c['status'] == 'pending').toList();
      final owed = pending.fold<double>(0, (s, c) => s + ((c['commission_amount'] as num?) ?? 0).toDouble());
      if (mounted) setState(() { _pendingCount = pending.length; _commOwed = owed; });
    } catch (_) {
      // commissions table unavailable — card shows "All clear" fallback
    }
    // Prima credits: separate table, balance column
    try {
      final row = await supabase
          .from('prima_credits')
          .select('balance')
          .eq('user_id', uid)
          .maybeSingle();
      if (row != null && mounted) {
        setState(() => _credits = ((row['balance'] as num?) ?? 0).toDouble());
      }
    } catch (_) {}
  }

  Future<void> _signOut() async {
    await supabase.auth.signOut();
    if (mounted) context.go('/auth');
  }

  void _openEdit() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _EditSheet(profile: _profile ?? {}, onSaved: _load),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(backgroundColor: _bg, body: Center(child: PrimaLoader()));
    }
    final p          = _profile ?? {};
    // Use first wallet for profile display; sum across currencies would mix apples/oranges
    final firstWalletEntry = _profileWallets.entries.isNotEmpty ? _profileWallets.entries.first : null;
    final balance    = firstWalletEntry?.value ?? 0.0;
    final currency   = firstWalletEntry?.key ?? 'NGN';
    final gigs       = ((p['gigs_completed'] as num?) ?? 0).toInt();
    final selfieVer  = p['selfie_verified'] == true;
    final reverify   = p['reverification_required'] == true;
    final isVerified = p['is_verified'] == true;
    final completion = _profileComplete(p);
    final lvl        = _lvlFor(gigs);
    final nxtLvl     = _nextLvl(lvl);
    final lvlProg    = _lvlProgress(lvl, nxtLvl, gigs);
    final credits    = _credits;

    // dynamic progress targets
    final nextEarned  = _nextTarget(_totalEarned.toInt(), 100);
    final nextGigs    = _nextTarget(gigs, 10);
    final nextReviews = _nextTarget(_reviewCount, 10);

    return Scaffold(
      backgroundColor: _bg,
      body: RefreshIndicator(
        onRefresh: _load,
        color: _purple,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            // 1. Identity card
            _IdentityCard(profile: p, mode: _mode, onModeChange: (m) => setState(() => _mode = m), onEdit: _openEdit, onSignOut: _signOut),
            // 2. Profile strength
            if (completion < 80) _StrengthBar(pct: completion, onTap: _openEdit),
            const SizedBox(height: 10),
            // 3. Financial: Wallet + Commission row
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(children: [
                Expanded(child: _WalletCard(balance: balance, currency: currency, onTap: () => context.push('/wallet'))),
                const SizedBox(width: 10),
                Expanded(child: GestureDetector(
                  onTap: () => context.push('/commission'),
                  child: _CommissionCard(pendingCount: _pendingCount, commOwed: _commOwed),
                )),
              ]),
            ),
            const SizedBox(height: 10),
            // 4. Credits card
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: GestureDetector(
                onTap: () => context.push('/withdraw-credits'),
                child: _CreditsCard(credits: credits),
              ),
            ),
            const SizedBox(height: 10),
            // 5. Level card
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: _LevelCard(lvl: lvl, nxtLvl: nxtLvl, progress: lvlProg, gigs: gigs),
            ),
            const SizedBox(height: 10),
            // 6. Refer & Earn
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: _ReferCard(onTap: () => context.push('/refer')),
            ),
            const SizedBox(height: 10),
            // 7. Verification banners
            if (!selfieVer)
              _VerifyBannerSelfie(onTap: () {}),
            if (reverify)
              _VerifyBannerReverify(onTap: () {}),
            const SizedBox(height: 10),
            // 8. Progress overview
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: _ProgressOverview(
                earned: _totalEarned, nextEarned: nextEarned,
                gigs: gigs, nextGigs: nextGigs,
                reviews: _reviewCount, nextReviews: nextReviews,
              ),
            ),
            const SizedBox(height: 10),
            // 9. Tabs (pill style)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: _PillTabBar(active: _activeTab, onSelect: (t) => setState(() => _activeTab = t)),
            ),
            const SizedBox(height: 8),
            // 10. Tab content
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: _TabContent(
                tab: _activeTab,
                profile: p,
                mode: _mode,
                uid: supabase.auth.currentUser?.id ?? '',
                totalEarned: _totalEarned,
                gigs: gigs,
                avgRating: _avgRating,
                reviewCount: _reviewCount,
              ),
            ),
            const SizedBox(height: 10),
            // 11. Get Verified banner
            if (!isVerified)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: _GetVerifiedBanner(),
              ),
            const SizedBox(height: 10),
            // 12. Coming Soon
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: _ComingSoonSection(),
            ),
            const SizedBox(height: 10),
            // 13. Logout
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
              child: GestureDetector(
                onTap: _signOut,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFE8EE),
                    border: Border.all(color: const Color(0xFFFF99B3), width: 1.5),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Center(child: Text('Log Out of Prima', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFFFF3366)))),
                ),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

// ─── IDENTITY CARD ───────────────────────────────────────────────────────────

class _IdentityCard extends StatelessWidget {
  final Map<String, dynamic> profile;
  final String mode;
  final ValueChanged<String> onModeChange;
  final VoidCallback onEdit, onSignOut;
  const _IdentityCard({required this.profile, required this.mode, required this.onModeChange, required this.onEdit, required this.onSignOut});

  @override
  Widget build(BuildContext context) {
    final name      = profile['full_name'] as String? ?? '';
    final username  = profile['username'] as String? ?? '';
    final location  = profile['location'] as String? ?? '';
    final bio       = profile['bio'] as String? ?? '';
    final avatarUrl = profile['avatar_url'] as String?;
    final isVerified = profile['is_verified'] == true;
    final init      = name.isNotEmpty ? name[0].toUpperCase() : '?';

    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF6C47FF), Color(0xFF9B59FF), Color(0xFFFF4DCF)],
          stops: [0.0, 0.5, 1.0],
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(children: [
            // Edit button top-right
            Align(
              alignment: Alignment.topRight,
              child: GestureDetector(
                onTap: onEdit,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                    color: Colors.white.withAlpha(50),
                    border: Border.all(color: Colors.white.withAlpha(80)),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: const [
                    BrandIcon(name: 'edit', size: 20, active: true),
                    SizedBox(width: 5),
                    Text('Edit', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
                  ]),
                ),
              ),
            ),
            const SizedBox(height: 8),
            GestureDetector(
              onTap: onEdit,
              child: Container(
                width: 96,
                height: 96,
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withAlpha(54),
                  border: Border.all(color: Colors.white.withAlpha(95), width: 2),
                ),
                child: ClipOval(
                  child: avatarUrl != null
                      ? CachedNetworkImage(
                          imageUrl: avatarUrl,
                          fit: BoxFit.cover,
                          errorWidget: (ctx, url, err) => _avatarInitial(init),
                        )
                      : _avatarInitial(init),
                ),
              ),
            ),
            const SizedBox(height: 12),
            // Name
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Flexible(child: Text(name.isEmpty ? 'Your Name' : name, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: Colors.white), textAlign: TextAlign.center)),
              if (isVerified) ...[const SizedBox(width: 6), const Icon(Icons.verified_rounded, color: Colors.white, size: 18)],
            ]),
            Text('@${username.isEmpty ? 'username' : username}', style: const TextStyle(fontSize: 14, color: Colors.white70)),
            const SizedBox(height: 4),
            if (location.isNotEmpty)
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                const BrandIcon(name: 'location', size: 20, active: true),
                const SizedBox(width: 4),
                Text(location, style: const TextStyle(fontSize: 13, color: Colors.white70)),
              ]),
            const SizedBox(height: 10),
            // Badges
            Wrap(alignment: WrapAlignment.center, spacing: 7, runSpacing: 6, children: [
              if (isVerified) Container(
                padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
                decoration: BoxDecoration(color: Colors.white.withAlpha(45), border: Border.all(color: Colors.white.withAlpha(80)), borderRadius: BorderRadius.circular(9)),
                child: const Text('✓ Verified', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
                decoration: BoxDecoration(color: Colors.white.withAlpha(45), border: Border.all(color: Colors.white.withAlpha(80)), borderRadius: BorderRadius.circular(9)),
                child: Text(_lvlFor(((profile['gigs_completed'] as num?) ?? 0).toInt()).label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Colors.white)),
              ),
            ]),
            // Bio box
            if (bio.isNotEmpty) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Colors.white.withAlpha(38), borderRadius: BorderRadius.circular(12)),
                child: Text(bio, style: const TextStyle(fontSize: 12, color: Colors.white, height: 1.6)),
              ),
            ],
            const SizedBox(height: 16),
            // Physical / Digital mode toggle
            Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(color: Colors.white.withAlpha(38), borderRadius: BorderRadius.circular(13)),
              child: Row(children: [
                _modeBtn('physical', 'Physical', mode, onModeChange),
                _modeBtn('digital',  'Digital',  mode, onModeChange),
              ]),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _avatarInitial(String init) => Container(
    color: Colors.white.withAlpha(50),
    child: Center(child: Text(init, style: const TextStyle(fontSize: 31, fontWeight: FontWeight.w800, color: Colors.white, height: 1))),
  );

  Widget _modeBtn(String val, String label, String current, ValueChanged<String> onChange) {
    final active = current == val;
    return Expanded(child: GestureDetector(
      onTap: () => onChange(val),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 9),
        decoration: BoxDecoration(
          color: active ? Colors.white.withAlpha(64) : Colors.transparent,
          borderRadius: BorderRadius.circular(9),
        ),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          BrandIcon(name: val, size: 18, active: active),
          const SizedBox(width: 5),
          Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: active ? Colors.white : Colors.white.withAlpha(128))),
        ]),
      ),
    ));
  }
}

// ─── TRUST RING ──────────────────────────────────────────────────────────────

class _TrustRing extends StatefulWidget {
  final double score;
  final String? avatarUrl;
  final String initial;
  final double size;
  final VoidCallback? onTap;
  const _TrustRing({required this.score, this.avatarUrl, required this.initial, required this.size, this.onTap});
  @override
  State<_TrustRing> createState() => _TrustRingState();
}

class _TrustRingState extends State<_TrustRing> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100));
    _anim = Tween<double>(begin: 0, end: widget.score / 100)
        .animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic));
    Future.delayed(const Duration(milliseconds: 150), () { if (mounted) _ctrl.forward(); });
  }

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      child: AnimatedBuilder(
        animation: _anim,
        builder: (ctx, child) => CustomPaint(
          painter: _RingPainter(progress: _anim.value, color: _ringColor(widget.score), size: widget.size),
          child: SizedBox(
            width: widget.size,
            height: widget.size,
            child: Padding(
              padding: EdgeInsets.all(6),
              child: ClipOval(child: widget.avatarUrl != null
                  ? CachedNetworkImage(imageUrl: widget.avatarUrl!, fit: BoxFit.cover, errorWidget: (ctx2, url, err) => _initials())
                  : _initials()),
            ),
          ),
        ),
      ),
    );
  }

  Widget _initials() => Container(
    color: Colors.white.withAlpha(50),
    child: Center(child: Text(widget.initial, style: TextStyle(fontSize: widget.size * 0.32, fontWeight: FontWeight.w800, color: Colors.white, height: 1))),
  );
}

class _RingPainter extends CustomPainter {
  final double progress, size;
  final Color color;
  const _RingPainter({required this.progress, required this.color, required this.size});

  @override
  void paint(Canvas canvas, Size sz) {
    final cx  = sz.width / 2;
    final cy  = sz.height / 2;
    final r   = (size - 8) / 2;
    final sw  = 4.0;
    final rect = Rect.fromCircle(center: Offset(cx, cy), radius: r);
    canvas.drawArc(rect, -math.pi / 2, math.pi * 2, false, Paint()
      ..color = Colors.white.withAlpha(64)
      ..strokeWidth = sw
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round);
    if (progress > 0) {
      canvas.drawArc(rect, -math.pi / 2, math.pi * 2 * progress, false, Paint()
        ..color = color
        ..strokeWidth = sw
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round);
    }
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.progress != progress;
}

// ─── STRENGTH BAR ────────────────────────────────────────────────────────────

class _StrengthBar extends StatelessWidget {
  final int pct;
  final VoidCallback onTap;
  const _StrengthBar({required this.pct, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 0),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: Colors.white, border: Border.all(color: _border, width: 1.5), borderRadius: BorderRadius.circular(16)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Expanded(child: Text('Profile Strength', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _dark))),
            Text('$pct%', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: _purple)),
          ]),
          const SizedBox(height: 8),
          _GradientBar(value: pct / 100, gradient: const [Color(0xFF6C47FF), Color(0xFF9B59FF)], height: 6),
          const SizedBox(height: 6),
          const Text('Complete your profile to unlock more gigs →', style: TextStyle(fontSize: 10, color: _muted)),
        ]),
      ),
    );
  }
}

// ─── GRADIENT PROGRESS BAR ───────────────────────────────────────────────────

class _GradientBar extends StatefulWidget {
  final double value;
  final List<Color> gradient;
  final double height;
  final Duration delay;
  const _GradientBar({required this.value, required this.gradient, required this.height, this.delay = Duration.zero});

  @override
  State<_GradientBar> createState() => _GradientBarState();
}

class _GradientBarState extends State<_GradientBar> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
    _anim = CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic);
    Future.delayed(const Duration(milliseconds: 150) + widget.delay, () { if (mounted) _ctrl.forward(); });
  }

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _anim,
      builder: (ctx, child) => Container(
        height: widget.height,
        decoration: BoxDecoration(color: _border, borderRadius: BorderRadius.circular(widget.height)),
        child: Align(
          alignment: Alignment.centerLeft,
          child: FractionallySizedBox(
            widthFactor: (_anim.value * widget.value).clamp(0.0, 1.0),
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: widget.gradient),
                borderRadius: BorderRadius.circular(widget.height),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ─── WALLET CARD ─────────────────────────────────────────────────────────────

class _WalletCard extends StatelessWidget {
  final double balance;
  final String currency;
  final VoidCallback onTap;
  const _WalletCard({required this.balance, required this.currency, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF00C48C), Color(0xFF00A878)]),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('WALLET', style: TextStyle(fontSize: 9, color: Colors.white70, fontWeight: FontWeight.w700, letterSpacing: 1)),
          const SizedBox(height: 4),
          Text('$currency ${NumberFormat('#,##0.00').format(balance)}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white)),
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 6),
            decoration: BoxDecoration(color: Colors.white.withAlpha(64), border: Border.all(color: Colors.white.withAlpha(100)), borderRadius: BorderRadius.circular(8)),
            child: const Center(child: Text('Open Wallet', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white))),
          ),
        ]),
      ),
    );
  }
}

// ─── COMMISSION CARD ─────────────────────────────────────────────────────────

class _CommissionCard extends StatelessWidget {
  final int pendingCount;
  final double commOwed;
  const _CommissionCard({required this.pendingCount, required this.commOwed});

  @override
  Widget build(BuildContext context) {
    final hasPending = pendingCount > 0;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: hasPending ? const Color(0xFFFFE8EE) : const Color(0xFFDFFDF4),
        border: Border.all(color: hasPending ? const Color(0xFFFF99B3) : const Color(0xFF7EECD2), width: 1.5),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('COMMISSION', style: TextStyle(fontSize: 9, color: hasPending ? const Color(0xFFFF3366) : _green, fontWeight: FontWeight.w700, letterSpacing: 1)),
        const SizedBox(height: 4),
        if (hasPending) ...[
          Text(NumberFormat('#,##0.00').format(commOwed), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Color(0xFFFF3366))),
          const SizedBox(height: 4),
          Text('$pendingCount pending →', style: const TextStyle(fontSize: 11, color: Color(0xFFFF3366))),
        ] else ...[
          const SizedBox(height: 8),
          const Text('✓ All clear', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: _green)),
        ],
      ]),
    );
  }
}

// ─── CREDITS CARD ────────────────────────────────────────────────────────────

class _CreditsCard extends StatelessWidget {
  final double credits;
  const _CreditsCard({required this.credits});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF6C47FF), Color(0xFF9B59FF)]),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('PRIMA CREDITS', style: TextStyle(fontSize: 9, color: Colors.white70, fontWeight: FontWeight.w700, letterSpacing: 1)),
          const SizedBox(height: 4),
          Text(NumberFormat('#,##0').format(credits), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Colors.white)),
          Text('≈ \$${NumberFormat('#,##0.00').format(credits / 100)}', style: const TextStyle(fontSize: 10, color: Colors.white60)),
        ]),
        const Text('Withdraw →', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white70)),
      ]),
    );
  }
}

// ─── LEVEL CARD ──────────────────────────────────────────────────────────────

class _LevelCard extends StatelessWidget {
  final _LvlData lvl;
  final _LvlData? nxtLvl;
  final int progress, gigs;
  const _LevelCard({required this.lvl, required this.nxtLvl, required this.progress, required this.gigs});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: lvl.bg, border: Border.all(color: lvl.bdr, width: 1.5), borderRadius: BorderRadius.circular(20)),
      child: IntrinsicHeight(child: Row(children: [
        // Left – current
        Expanded(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          BrandIcon(name: lvl.icon, size: 36, active: true, tone: lvl.tone),
          const SizedBox(height: 8),
          Text('Current Level', style: TextStyle(fontSize: 10, color: lvl.color, fontWeight: FontWeight.w700, letterSpacing: 0.8)),
          const SizedBox(height: 3),
          Text(lvl.label, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: _dark)),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
            decoration: BoxDecoration(gradient: LinearGradient(colors: lvl.tone), borderRadius: BorderRadius.circular(8)),
            child: const Text('Stats →', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
          ),
        ])),
        // Divider
        Container(width: 1.5, color: lvl.bdr, margin: const EdgeInsets.symmetric(horizontal: 16)),
        // Right – next
        Expanded(child: nxtLvl != null
          ? Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                const Text('Next:', style: TextStyle(fontSize: 12, color: _muted, fontWeight: FontWeight.w600)),
                const SizedBox(width: 6),
                BrandIcon(name: nxtLvl!.icon, size: 28, active: true, tone: nxtLvl!.tone),
                const SizedBox(width: 4),
                Flexible(child: Text(nxtLvl!.label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: _dark))),
              ]),
              const SizedBox(height: 10),
              _GradientBar(value: progress / 100, gradient: [lvl.color, lvl.color.withAlpha(180)], height: 9, delay: const Duration(milliseconds: 150)),
              const SizedBox(height: 8),
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Flexible(child: Text(
                  nxtLvl!.min - gigs > 0 ? '${nxtLvl!.min - gigs} gigs to go' : 'Ready!',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _muted),
                )),
                Text('$progress%', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: lvl.color)),
              ]),
            ])
          : Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              BrandIcon(name: 'rating', size: 44, active: true, tone: const [Color(0xFFFFB800), Color(0xFFFF6B2B)]),
              const SizedBox(height: 8),
              Text('Max level reached!', style: TextStyle(fontSize: 13, color: lvl.color, fontWeight: FontWeight.w700)),
            ]),
        ),
      ])),
    );
  }
}

// ─── REFER CARD ──────────────────────────────────────────────────────────────

class _ReferCard extends StatelessWidget {
  final VoidCallback onTap;
  const _ReferCard({required this.onTap});
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF6C47FF), Color(0xFF9B59FF), Color(0xFFFF4DCF)], stops: [0, 0.55, 1]),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(children: [
        Container(
          width: 40, height: 40,
          decoration: BoxDecoration(color: Colors.white.withAlpha(50), border: Border.all(color: Colors.white.withAlpha(80)), borderRadius: BorderRadius.circular(12)),
          child: const Center(child: BrandIcon(name: 'commission', size: 32, active: true)),
        ),
        const SizedBox(width: 12),
        const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Refer & Earn', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Colors.white)),
          SizedBox(height: 2),
          Text("5% of friends' first gig earnings", style: TextStyle(fontSize: 10, color: Colors.white70)),
        ])),
        const Text('→', style: TextStyle(color: Colors.white70, fontSize: 14)),
      ]),
    ));
  }
}

// ─── VERIFICATION BANNERS ────────────────────────────────────────────────────

class _VerifyBannerSelfie extends StatelessWidget {
  final VoidCallback onTap;
  const _VerifyBannerSelfie({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFFF6B2B), Color(0xFFFF4DCF)]),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(color: Colors.white.withAlpha(50), borderRadius: BorderRadius.circular(12)),
            child: const Center(child: BrandIcon(name: 'camera', size: 32, active: true)),
          ),
          const SizedBox(width: 10),
          const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Verify Yourself', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Colors.white)),
            Text('Required to post & apply', style: TextStyle(fontSize: 10, color: Color(0xCCFFFFFF))),
          ])),
        ]),
      ),
    );
  }
}

class _VerifyBannerReverify extends StatelessWidget {
  final VoidCallback onTap;
  const _VerifyBannerReverify({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: const Color(0xFFFFE8EE), border: Border.all(color: const Color(0xFFFF99B3), width: 1.5), borderRadius: BorderRadius.circular(16)),
        child: Row(children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(color: const Color(0xFFFFE8EE), border: Border.all(color: const Color(0xFFFF99B3), width: 1.5), borderRadius: BorderRadius.circular(12)),
            child: const Center(child: BrandIcon(name: 'level', size: 32, active: true, tone: [Color(0xFFFF3366), Color(0xFFFF6B2B)])),
          ),
          const SizedBox(width: 10),
          const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Re-verification Needed', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Color(0xFFFF3366))),
            Text('Take a new selfie', style: TextStyle(fontSize: 10, color: Color(0xFFFF3366))),
          ])),
        ]),
      ),
    );
  }
}

// ─── PROGRESS OVERVIEW ───────────────────────────────────────────────────────

class _ProgressOverview extends StatelessWidget {
  final double earned;
  final int gigs, nextGigs, nextEarned, reviews, nextReviews;
  const _ProgressOverview({required this.earned, required this.nextEarned, required this.gigs, required this.nextGigs, required this.reviews, required this.nextReviews});

  @override
  Widget build(BuildContext context) {
    final metrics = [
      ('Total Earned', '₦${NumberFormat('#,##0').format(earned)}', earned, nextEarned.toDouble(), const [Color(0xFF00C48C), Color(0xFF06D6D6)], 0),
      ('Gigs Completed', '$gigs', gigs.toDouble(), nextGigs.toDouble(), const [Color(0xFF6C47FF), Color(0xFF0EA5E9)], 1),
      ('Reviews', '$reviews/$nextReviews', reviews.toDouble(), nextReviews.toDouble(), const [Color(0xFFFF4DCF), Color(0xFF9B59FF)], 2),
    ];
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, border: Border.all(color: _border, width: 1.5), borderRadius: BorderRadius.circular(16)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('PROGRESS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: _dark, letterSpacing: 0.6)),
        const SizedBox(height: 12),
        ...metrics.map((m) => Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(m.$1, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _muted))),
              Text(m.$2, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: _dark)),
            ]),
            const SizedBox(height: 5),
            _GradientBar(value: (m.$3 / (m.$4 == 0 ? 1 : m.$4)).clamp(0.0, 1.0), gradient: m.$5, height: 5, delay: Duration(milliseconds: m.$6 * 60)),
          ]),
        )),
      ]),
    );
  }
}

// ─── PILL TAB BAR ────────────────────────────────────────────────────────────

class _PillTabBar extends StatelessWidget {
  final String active;
  final ValueChanged<String> onSelect;
  const _PillTabBar({required this.active, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    const tabs = ['about', 'skills', 'experience', 'activity', 'links'];
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white, border: Border.all(color: _border, width: 1.5), borderRadius: BorderRadius.circular(14)),
      child: Row(children: tabs.map((tab) {
        final isActive = active == tab;
        return Expanded(child: GestureDetector(
          onTap: () => onSelect(tab),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 9),
            decoration: BoxDecoration(color: isActive ? _purple : Colors.transparent, borderRadius: BorderRadius.circular(10)),
            child: Center(child: Text(
              tab[0].toUpperCase() + tab.substring(1),
              style: TextStyle(fontSize: 11, fontWeight: isActive ? FontWeight.w700 : FontWeight.w500, color: isActive ? Colors.white : _muted),
            )),
          ),
        ));
      }).toList()),
    );
  }
}

// ─── TAB CONTENT ─────────────────────────────────────────────────────────────

class _TabContent extends StatelessWidget {
  final String tab, mode, uid;
  final Map<String, dynamic> profile;
  final double totalEarned, avgRating;
  final int gigs, reviewCount;
  const _TabContent({required this.tab, required this.profile, required this.mode, required this.uid, required this.totalEarned, required this.gigs, required this.avgRating, required this.reviewCount});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: Colors.white, border: Border.all(color: _border, width: 1.5), borderRadius: BorderRadius.circular(16)),
      child: switch (tab) {
        'skills'     => _SkillsTab(profile: profile, mode: mode),
        'experience' => _ExperienceTab(experience: profile['work_experience'] as String?),
        'activity'   => _ActivityTab(totalEarned: totalEarned, gigs: gigs, avgRating: avgRating),
        'links'      => _LinksTab(profile: profile),
        _            => _AboutTab(profile: profile, uid: uid),
      },
    );
  }
}

// ─── ABOUT TAB ───────────────────────────────────────────────────────────────

class _AboutTab extends StatelessWidget {
  final Map<String, dynamic> profile;
  final String uid;
  const _AboutTab({required this.profile, required this.uid});

  @override
  Widget build(BuildContext context) {
    final bio = profile['bio'] as String? ?? '';
    final joinedAt = profile['joined_at'] as String?;
    final joined = joinedAt != null
        ? DateFormat('MMMM yyyy').format(parseTs(joinedAt).toLocal())
        : 'Recently';
    final email = supabase.auth.currentUser?.email ?? '—';
    final items = [
      ('location',      'Location',  profile['location'] as String? ?? 'Not set'),
      ('notifications', 'Email',     email),
      ('phone',         'Phone',     profile['phone'] as String? ?? 'Not set'),
      ('open',          'Response',  (profile['response_time'] as String? ?? '1 hour').replaceFirst(RegExp(r'^<\s*'), '')),
      ('completed',     'Joined',    joined),
      ('accepted',      'Status',    profile['is_available'] == true ? 'Available' : 'Busy'),
    ];

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('ABOUT', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _muted, letterSpacing: 1)),
      const SizedBox(height: 12),
      if (bio.isNotEmpty) ...[
        Text(bio, style: const TextStyle(fontSize: 14, color: Color(0xFF5B5887), height: 1.7)),
        const SizedBox(height: 16),
      ] else ...[
        const Text('No bio yet. Tap Edit to add one.', style: TextStyle(fontSize: 13, color: _muted)),
        const SizedBox(height: 16),
      ],
      GridView.count(
        crossAxisCount: 2,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        childAspectRatio: 2.1,
        children: items.map((item) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(color: const Color(0xFFF5F4FF), borderRadius: BorderRadius.circular(10)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
            Row(children: [
              BrandIcon(name: item.$1, size: 22, active: false),
              const SizedBox(width: 6),
              Text(item.$2, style: const TextStyle(fontSize: 10, color: _muted, fontWeight: FontWeight.w600)),
            ]),
            const SizedBox(height: 4),
            Text(item.$3, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _dark), overflow: TextOverflow.ellipsis),
          ]),
        )).toList(),
      ),
    ]);
  }
}

// ─── SKILLS TAB ──────────────────────────────────────────────────────────────

class _SkillsTab extends StatelessWidget {
  final Map<String, dynamic> profile;
  final String mode;
  const _SkillsTab({required this.profile, required this.mode});

  @override
  Widget build(BuildContext context) {
    final skills = (profile['skills'] as List?)?.cast<String>() ?? [];
    final isPhysical = mode == 'physical';
    final tagBg     = isPhysical ? const Color(0xFFFFF0E8) : const Color(0xFFEEE9FF);
    final tagBorder = isPhysical ? const Color(0xFFFFBC99) : const Color(0xFFB8A5FF);
    final tagColor  = isPhysical ? const Color(0xFFFF6B2B) : _purple;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        BrandIcon(name: isPhysical ? 'physical' : 'digital', size: 22, active: true),
        const SizedBox(width: 6),
        Text(isPhysical ? 'Physical Skills' : 'Digital Skills', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _muted, letterSpacing: 1)),
      ]),
      const SizedBox(height: 12),
      if (skills.isNotEmpty)
        Wrap(spacing: 8, runSpacing: 8, children: skills.map((s) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
          decoration: BoxDecoration(color: tagBg, border: Border.all(color: tagBorder, width: 1.5), borderRadius: BorderRadius.circular(20)),
          child: Text(s, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: tagColor)),
        )).toList())
      else
        const Text('No skills added yet. Tap Edit to add your skills.', style: TextStyle(fontSize: 13, color: _muted)),
      const SizedBox(height: 16),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: const Color(0xFFF5F4FF), borderRadius: BorderRadius.circular(10)),
        child: const Text('Toggle between Physical and Digital mode on your identity card to see how skills appear to different clients.', style: TextStyle(fontSize: 12, color: _muted, height: 1.5)),
      ),
    ]);
  }
}

// ─── EXPERIENCE TAB ──────────────────────────────────────────────────────────

class _ExperienceTab extends StatelessWidget {
  final String? experience;
  const _ExperienceTab({this.experience});

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('WORK EXPERIENCE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _muted, letterSpacing: 1)),
      const SizedBox(height: 12),
      if (experience != null && experience!.isNotEmpty)
        Text(experience!, style: const TextStyle(fontSize: 14, color: Color(0xFF5B5887), height: 1.7))
      else
        const Text('No experience added yet. Tap Edit to describe your background.', style: TextStyle(fontSize: 13, color: _muted)),
    ]);
  }
}

// ─── ACTIVITY TAB ────────────────────────────────────────────────────────────

class _ActivityTab extends StatelessWidget {
  final double totalEarned, avgRating;
  final int gigs;
  const _ActivityTab({required this.totalEarned, required this.gigs, required this.avgRating});

  @override
  Widget build(BuildContext context) {
    final stats = [
      ('Total Earned', '₦${NumberFormat('#,##0').format(totalEarned)}', const Color(0xFF00C48C)),
      ('Gigs Completed', '$gigs', _dark),
      ('Avg. Rating', avgRating > 0 ? avgRating.toStringAsFixed(1) : '0.0', const Color(0xFFFFB800)),
    ];
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('THIS MONTH', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _muted, letterSpacing: 1)),
      const SizedBox(height: 14),
      ...stats.map((s) => Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: _border))),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(s.$1, style: const TextStyle(fontSize: 13, color: _muted)),
          Text(s.$2, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: s.$3)),
        ]),
      )),
      const SizedBox(height: 20),
      _ComingSoonCard(icon: 'stats', title: 'Full Analytics Dashboard', desc: 'Earnings trends, gig performance, and conversion rates over time.', gradient: const [Color(0xFF6C47FF), Color(0xFF9B59FF)]),
      const SizedBox(height: 10),
      _ComingSoonCard(icon: 'receipt', title: 'Activity Log', desc: 'A complete timeline of every action on your account.', gradient: const [Color(0xFF00C48C), Color(0xFF00A878)]),
    ]);
  }
}

// ─── LINKS TAB ───────────────────────────────────────────────────────────────

class _LinksTab extends StatelessWidget {
  final Map<String, dynamic> profile;
  const _LinksTab({required this.profile});

  @override
  Widget build(BuildContext context) {
    final links = [
      ('portfolio', 'Portfolio',   profile['portfolio_url'] as String?),
      ('linkedin',  'LinkedIn',    profile['social_linkedin'] as String?),
      ('twitter',   'Twitter / X', profile['social_twitter'] as String?),
    ];
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('LINKS & PORTFOLIO', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _muted, letterSpacing: 1)),
      const SizedBox(height: 12),
      ...links.map((l) => Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(color: const Color(0xFFF5F4FF), borderRadius: BorderRadius.circular(10)),
        child: Row(children: [
          BrandIcon(name: l.$1, size: 28, active: false),
          const SizedBox(width: 8),
          Text(l.$2, style: const TextStyle(fontSize: 13, color: _muted, fontWeight: FontWeight.w600)),
          const Spacer(),
          if (l.$3 != null && l.$3!.isNotEmpty)
            const Text('Visit →', style: TextStyle(fontSize: 12, color: _purple, fontWeight: FontWeight.w600))
          else
            const Text('Not set', style: TextStyle(fontSize: 12, color: _muted)),
        ]),
      )),
    ]);
  }
}

// ─── GET VERIFIED BANNER ─────────────────────────────────────────────────────

class _GetVerifiedBanner extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFFFF8E0), Color(0xFFFFF0E8)]),
        border: Border.all(color: const Color(0xFFFFBC99), width: 1.5),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(children: [
        const BrandIcon(name: 'level', size: 42, active: true),
        const SizedBox(width: 12),
        const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Get Verified on Prima', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: _dark)),
          SizedBox(height: 3),
          Text('Verified users get 3x more gig responses. Show clients you\'re legit.', style: TextStyle(fontSize: 12, color: _muted, height: 1.5)),
        ])),
        const SizedBox(width: 10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: BoxDecoration(
            gradient: const LinearGradient(colors: [Color(0xFFFFB800), Color(0xFFFF6B2B)]),
            borderRadius: BorderRadius.circular(10),
          ),
          child: const Text('Get Verified', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
        ),
      ]),
    );
  }
}

// ─── COMING SOON SECTION ─────────────────────────────────────────────────────

class _ComingSoonSection extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Padding(
        padding: EdgeInsets.only(bottom: 10),
        child: Text('COMING TO PRIMA', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _muted, letterSpacing: 1)),
      ),
      _ComingSoonCard(icon: 'level', title: 'Verified ID + Payment Badge', desc: 'A stronger trust signal showing ID and payment method are both verified.', gradient: const [Color(0xFF6C47FF), Color(0xFF9B59FF)]),
      const SizedBox(height: 10),
      _ComingSoonCard(icon: 'accepted', title: 'Prima Pro', desc: 'Priority placement, lower commission, and advanced tools for power users.', gradient: const [Color(0xFFFFB800), Color(0xFFFF6B2B)]),
    ]);
  }
}

class _ComingSoonCard extends StatelessWidget {
  final String icon, title, desc;
  final List<Color> gradient;
  const _ComingSoonCard({required this.icon, required this.title, required this.desc, required this.gradient});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, border: Border.all(color: _border, width: 1.5), borderRadius: BorderRadius.circular(16)),
      child: Row(children: [
        Container(
          width: 42, height: 42,
          decoration: BoxDecoration(gradient: LinearGradient(colors: gradient), borderRadius: BorderRadius.circular(12)),
          child: Center(child: BrandIcon(name: icon, size: 34, active: true, tone: gradient)),
        ),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _dark)),
          const SizedBox(height: 2),
          Text(desc, style: const TextStyle(fontSize: 11, color: _muted, height: 1.4)),
        ])),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(color: const Color(0xFFF5F4FF), border: Border.all(color: _border), borderRadius: BorderRadius.circular(6)),
          child: const Text('SOON', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: _muted, letterSpacing: 0.4)),
        ),
      ]),
    );
  }
}

// ─── EDIT PROFILE SHEET ──────────────────────────────────────────────────────

class _EditSheet extends StatefulWidget {
  final Map<String, dynamic> profile;
  final VoidCallback onSaved;
  const _EditSheet({required this.profile, required this.onSaved});

  @override
  State<_EditSheet> createState() => _EditSheetState();
}

class _EditSheetState extends State<_EditSheet> {
  bool _saving = false;
  File? _avatarFile;
  List<Map<String, dynamic>> _locSuggestions = [];
  bool _locLoading = false;

  late final TextEditingController _name, _username, _phone, _location, _bio, _experience, _portfolio, _linkedin, _twitter, _skillInput;
  late bool _physical, _digital;
  late List<String> _skills;

  @override
  void initState() {
    super.initState();
    final p     = widget.profile;
    _name       = TextEditingController(text: p['full_name'] ?? '');
    _username   = TextEditingController(text: p['username'] ?? '');
    _phone      = TextEditingController(text: p['phone'] ?? '');
    _location   = TextEditingController(text: p['location'] ?? '');
    _bio        = TextEditingController(text: p['bio'] ?? '');
    _experience = TextEditingController(text: p['work_experience'] ?? '');
    _portfolio  = TextEditingController(text: p['portfolio_url'] ?? '');
    _linkedin   = TextEditingController(text: p['social_linkedin'] ?? '');
    _twitter    = TextEditingController(text: p['social_twitter'] ?? '');
    _skillInput = TextEditingController();
    _physical   = p['physical_mode'] == true;
    _digital    = p['digital_mode'] == true;
    _skills     = List<String>.from(p['skills'] as List? ?? []);
  }

  @override
  void dispose() {
    for (final c in [_name, _username, _phone, _location, _bio, _experience, _portfolio, _linkedin, _twitter, _skillInput]) { c.dispose(); }
    super.dispose();
  }

  Future<void> _searchLocation(String q) async {
    if (q.length < 3) { setState(() => _locSuggestions = []); return; }
    setState(() => _locLoading = true);
    try {
      final uri = Uri.parse('https://nominatim.openstreetmap.org/search?format=json&q=${Uri.encodeComponent(q)}&limit=5&addressdetails=1');
      final res = await http.get(uri, headers: {'Accept-Language': 'en', 'User-Agent': 'PrimaApp/1.0'});
      final list = jsonDecode(res.body) as List;
      if (mounted) {
        setState(() {
          _locSuggestions = list.map((e) {
            final addr = e['address'] as Map? ?? {};
            final city    = addr['city'] ?? addr['town'] ?? addr['village'] ?? '';
            final state   = addr['state'] ?? '';
            final country = addr['country'] ?? '';
            final name    = [city, state, country].where((s) => (s as String).isNotEmpty).join(', ');
            return {'name': name.isNotEmpty ? name : (e['display_name'] as String).split(',').first, 'display': e['display_name'] as String};
          }).toList();
          _locLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _locLoading = false);
    }
  }

  Future<void> _pickAvatar() async {
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 80);
    if (picked != null && mounted) setState(() => _avatarFile = File(picked.path));
  }

  Future<String?> _uploadAvatar() async {
    if (_avatarFile == null) return widget.profile['avatar_url'] as String?;
    final uid  = supabase.auth.currentUser?.id ?? '';
    final ext  = _avatarFile!.path.split('.').last.toLowerCase();
    final name = '$uid.$ext';
    await supabase.storage.from('avatars').upload(name, _avatarFile!);
    return supabase.storage.from('avatars').getPublicUrl(name);
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final uid = supabase.auth.currentUser?.id ?? '';
      final avatarUrl = await _uploadAvatar();
      await supabase.from('users').update({
        'full_name':       _name.text.trim(),
        'username':        _username.text.trim(),
        'phone':           _phone.text.trim(),
        'location':        _location.text.trim(),
        'bio':             _bio.text.trim(),
        'work_experience': _experience.text.trim(),
        'portfolio_url':   _portfolio.text.trim(),
        'social_linkedin': _linkedin.text.trim(),
        'social_twitter':  _twitter.text.trim(),
        'physical_mode':   _physical,
        'digital_mode':    _digital,
        'skills':          _skills,
        // ignore: use_null_aware_elements
        if (avatarUrl != null) 'avatar_url': avatarUrl,
      }).eq('id', uid);
      if (mounted) { Navigator.pop(context); widget.onSaved(); }
    } catch (err) {
      if (mounted) primaSnack(context, '$err', isError: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.95,
      maxChildSize: 0.97,
      minChildSize: 0.5,
      builder: (_, ctrl) => Container(
        decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
            child: Column(children: [
              Container(width: 40, height: 4, decoration: BoxDecoration(color: _border, borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 14),
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                const Text('Edit Profile', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: _dark)),
                GestureDetector(
                  onTap: () => Navigator.pop(context),
                  child: Container(
                    width: 34, height: 34,
                    decoration: BoxDecoration(color: const Color(0xFFF5F4FF), border: Border.all(color: _border), borderRadius: BorderRadius.circular(8)),
                    child: const Center(child: Text('×', style: TextStyle(fontSize: 18, color: _muted, height: 1))),
                  ),
                ),
              ]),
              const SizedBox(height: 4),
            ]),
          ),
          Expanded(child: ListView(controller: ctrl, padding: const EdgeInsets.fromLTRB(22, 14, 22, 22), children: [
            // Avatar
            Center(child: GestureDetector(
              onTap: _pickAvatar,
              child: Stack(children: [
                ClipOval(child: _avatarFile != null
                    ? Image.file(_avatarFile!, width: 80, height: 80, fit: BoxFit.cover)
                    : (widget.profile['avatar_url'] != null
                        ? CachedNetworkImage(imageUrl: widget.profile['avatar_url'] as String, width: 80, height: 80, fit: BoxFit.cover, errorWidget: (ctx, url, err) => _fallback())
                        : _fallback())),
                Positioned(bottom: 0, right: 0, child: Container(padding: const EdgeInsets.all(5), decoration: const BoxDecoration(color: _purple, shape: BoxShape.circle), child: const Icon(Icons.camera_alt_rounded, color: Colors.white, size: 14))),
              ]),
            )),
            const SizedBox(height: 20),
            _sec('Full Name', [_fld(_name, 'Your full name')]),
            _sec('Username', [_fldRaw(_username, '@handle', prefix: const Text('@', style: TextStyle(color: _muted, fontSize: 14)))]),
            _sec('Phone', [_fld(_phone, '+1 400 000 0000', type: TextInputType.phone)]),
            _sec('Location', [
              _fld(_location, 'Search your city or area...', onChanged: _searchLocation),
              if (_locLoading) const Padding(padding: EdgeInsets.symmetric(vertical: 4), child: LinearProgressIndicator(color: _purple, minHeight: 2)),
              if (_locSuggestions.isNotEmpty) Container(
                margin: const EdgeInsets.only(top: 4),
                decoration: BoxDecoration(color: Colors.white, border: Border.all(color: const Color(0xFFB8A5FF), width: 1.5), borderRadius: BorderRadius.circular(12), boxShadow: const [BoxShadow(color: Color(0x266C47FF), blurRadius: 32, offset: Offset(0, 8))]),
                child: Column(children: _locSuggestions.take(4).toList().asMap().entries.map((entry) {
                  final i = entry.key;
                  final s = entry.value;
                  return GestureDetector(
                    onTap: () => setState(() { _location.text = s['name']!; _locSuggestions = []; }),
                    child: Container(
                      padding: const EdgeInsets.fromLTRB(14, 11, 14, 11),
                      decoration: BoxDecoration(border: Border(bottom: i < (_locSuggestions.length - 1).clamp(0, 3) ? const BorderSide(color: Color(0xFFF5F4FF)) : BorderSide.none)),
                      child: Row(children: [
                        const BrandIcon(name: 'location', size: 28, active: true),
                        const SizedBox(width: 8),
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(s['name']!, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _dark)),
                          Text(s['display']!, style: const TextStyle(fontSize: 10, color: _muted), maxLines: 1, overflow: TextOverflow.ellipsis),
                        ])),
                      ]),
                    ),
                  );
                }).toList()),
              ),
            ]),
            _sec('Bio', [_fld(_bio, 'Tell people what you do...', maxLines: 4)]),
            _sec('Work Experience', [_fld(_experience, 'Describe your experience...', maxLines: 5)]),
            _sec('Work Modes', [
              Row(children: [
                _modeCard('physical_mode', 'physical', 'Physical', const Color(0xFFFF6B2B), const Color(0xFFFFF0E8), const Color(0xFFFFBC99), _physical, (v) => setState(() => _physical = v)),
                const SizedBox(width: 10),
                _modeCard('digital_mode', 'digital', 'Digital', _purple, const Color(0xFFEEE9FF), const Color(0xFFB8A5FF), _digital, (v) => setState(() => _digital = v)),
              ]),
            ]),
            _sec('Skills', [
              if (_skills.isNotEmpty) ...[
                Wrap(spacing: 7, runSpacing: 7, children: _skills.map((s) => Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(color: const Color(0xFFEEE9FF), border: Border.all(color: const Color(0xFFB8A5FF), width: 1.5), borderRadius: BorderRadius.circular(20)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Text(s, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _purple)),
                    const SizedBox(width: 6),
                    GestureDetector(onTap: () => setState(() => _skills.remove(s)), child: const Text('×', style: TextStyle(fontSize: 14, color: _muted, height: 1))),
                  ]),
                )).toList()),
                const SizedBox(height: 10),
              ],
              Row(children: [
                Expanded(child: _fld(_skillInput, 'Add a skill...')),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: () {
                    final s = _skillInput.text.trim();
                    if (s.isNotEmpty && !_skills.contains(s)) { setState(() { _skills.add(s); _skillInput.clear(); }); }
                  },
                  child: Container(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12), decoration: BoxDecoration(color: _purple, borderRadius: BorderRadius.circular(10)), child: const Text('Add', style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600))),
                ),
              ]),
            ]),
            _sec('Portfolio URL', [_fld(_portfolio, 'https://yourportfolio.com', type: TextInputType.url)]),
            _sec('LinkedIn', [_fld(_linkedin, 'linkedin.com/in/yourname', type: TextInputType.url)]),
            _sec('Twitter / X', [_fld(_twitter, 'twitter.com/yourname')]),
          ])),
          Container(
            padding: EdgeInsets.fromLTRB(22, 14, 22, MediaQuery.of(context).viewInsets.bottom + 14),
            decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: Color(0xFFF5F4FF)))),
            child: Row(children: [
              Expanded(child: GestureDetector(
                onTap: _saving ? null : () => Navigator.pop(context),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  decoration: BoxDecoration(color: const Color(0xFFF5F4FF), border: Border.all(color: _border), borderRadius: BorderRadius.circular(12)),
                  child: const Center(child: Text('Cancel', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _muted))),
                ),
              )),
              const SizedBox(width: 10),
              Expanded(flex: 2, child: GestureDetector(
                onTap: _saving ? null : _save,
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  decoration: BoxDecoration(
                    gradient: _saving ? null : const LinearGradient(colors: [Color(0xFF6C47FF), Color(0xFF9B59FF)]),
                    color: _saving ? const Color(0xFFB8A5FF) : null,
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: _saving ? null : const [BoxShadow(color: Color(0x4D6C47FF), blurRadius: 16, offset: Offset(0, 4))],
                  ),
                  child: Center(child: _saving
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text('✓ Save Profile', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white))),
                ),
              )),
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _fallback() {
    final n = widget.profile['full_name'] as String? ?? '?';
    return Container(width: 80, height: 80, color: const Color(0xFFEEE9FF), child: Center(child: Text(n.isNotEmpty ? n[0].toUpperCase() : '?', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: _purple))));
  }

  Widget _sec(String label, List<Widget> children) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label.toUpperCase(), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: _muted, letterSpacing: 0.8)),
      const SizedBox(height: 6),
      ...children,
    ]),
  );

  Widget _fld(TextEditingController ctrl, String hint, {TextInputType? type, int maxLines = 1, ValueChanged<String>? onChanged}) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 14),
    decoration: BoxDecoration(color: const Color(0xFFF5F4FF), border: Border.all(color: _border, width: 1.5), borderRadius: BorderRadius.circular(10)),
    child: TextField(controller: ctrl, keyboardType: type, maxLines: maxLines, onChanged: onChanged, style: const TextStyle(fontSize: 13, color: _dark), decoration: InputDecoration(border: InputBorder.none, hintText: hint, hintStyle: const TextStyle(color: _muted, fontSize: 13), isDense: true, contentPadding: const EdgeInsets.symmetric(vertical: 11))),
  );

  Widget _fldRaw(TextEditingController ctrl, String hint, {Widget? prefix}) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 14),
    decoration: BoxDecoration(color: const Color(0xFFF5F4FF), border: Border.all(color: _border, width: 1.5), borderRadius: BorderRadius.circular(10)),
    child: Row(children: [
      // ignore: use_null_aware_elements
      if (prefix != null) prefix,
      Expanded(child: TextField(controller: ctrl, style: const TextStyle(fontSize: 13, color: _dark), decoration: InputDecoration(border: InputBorder.none, hintText: hint, hintStyle: const TextStyle(color: _muted, fontSize: 13), isDense: true, contentPadding: const EdgeInsets.symmetric(vertical: 11)))),
    ]),
  );

  Widget _modeCard(String key, String icon, String label, Color color, Color bg, Color bdr, bool val, ValueChanged<bool> onChange) => Expanded(child: GestureDetector(
    onTap: () => onChange(!val),
    child: Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: val ? bg : const Color(0xFFF5F4FF), border: Border.all(color: val ? bdr : _border, width: 1.5), borderRadius: BorderRadius.circular(12)),
      child: Column(children: [
        BrandIcon(name: icon, size: 40, active: val),
        const SizedBox(height: 8),
        Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: val ? color : _muted)),
        const SizedBox(height: 8),
        Container(
          width: 20, height: 20,
          decoration: BoxDecoration(color: val ? color : _border, shape: BoxShape.circle),
          child: val ? const Center(child: Text('✓', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700))) : null,
        ),
      ]),
    ),
  ));
}

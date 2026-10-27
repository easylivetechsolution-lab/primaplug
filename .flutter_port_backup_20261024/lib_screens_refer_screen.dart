import 'dart:math' as math;
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../main.dart';
import '../utils/dt.dart';
import '../widgets/prima_loader.dart';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const _purple = Color(0xFF6C47FF);
const _green  = Color(0xFF00C48C);
const _dark   = Color(0xFF14123A);
const _muted  = Color(0xFF8B8FAF);
const _border = Color(0xFFE2E0FF);
const _bg     = Color(0xFFF8F7FF);

const _kReferrerTrust    = 3;
const _kReferrerCredits  = 20;
const _kReferredTrust    = 3;
const _kReferredCredits  = 10;
const _kCreditsPerDollar = 50;

// ─── REFER SCREEN ────────────────────────────────────────────────────────────

class ReferScreen extends StatefulWidget {
  const ReferScreen({super.key});
  @override
  State<ReferScreen> createState() => _ReferScreenState();
}

class _ReferScreenState extends State<ReferScreen> {
  String?  _referralCode;
  double   _credits      = 0;
  List<Map<String, dynamic>> _referrals   = [];
  List<Map<String, dynamic>> _gigReferrals = [];
  List<Map<String, dynamic>> _leaderboard = [];
  bool _loading      = true;
  bool _generatingCode = false;
  bool _copied       = false;

  String get _referralLink => 'https://primaplug.com/?ref=${_referralCode ?? ''}';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    final uid = supabase.auth.currentUser?.id;
    if (uid == null) { if (mounted) setState(() => _loading = false); return; }

    // 1. Profile — must succeed for referral code to show
    Map<String, dynamic>? profile;
    try {
      profile = await supabase.from('users').select('referral_code, full_name').eq('id', uid).single();
      if (mounted) {
        setState(() {
          _referralCode = profile!['referral_code'] as String?;
          _loading      = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }

    // 2. Prima credits — separate so missing column can't break referral code display
    try {
      final p = await supabase.from('users').select('prima_credits').eq('id', uid).single();
      if (mounted) setState(() => _credits = ((p['prima_credits'] as num?) ?? 0).toDouble());
    } catch (_) {}

    // 3. Auto-generate if missing
    if (_referralCode == null || (_referralCode?.isEmpty ?? true)) {
      await _generateCode(profile ?? {'full_name': ''});
    }

    // 4. Referrals list — independent
    try {
      final referrals = await supabase.from('referrals')
          .select('*, referred:users!referrals_referred_id_fkey(full_name, avatar_url, joined_at)')
          .eq('referrer_id', uid)
          .order('created_at', ascending: false);
      if (mounted) setState(() => _referrals = (referrals as List).cast<Map<String, dynamic>>());
    } catch (_) {}

    try {
      final gigRefs = await supabase.from('gig_referrals')
          .select('*, referred:users!gig_referrals_referred_id_fkey(full_name, avatar_url), gigs(title, currency)')
          .eq('referrer_id', uid)
          .order('created_at', ascending: false);
      if (mounted) setState(() => _gigReferrals = (gigRefs as List).cast<Map<String, dynamic>>());
    } catch (_) {}

    // 5. Leaderboard — independent
    try {
      final allDone = await supabase.from('referrals')
          .select('referrer_id, users!referrals_referrer_id_fkey(full_name, avatar_url, trust_score)')
          .eq('status', 'completed');
      final counts = <String, Map<String, dynamic>>{};
      for (final r in (allDone as List)) {
        final id = r['referrer_id'] as String;
        counts.putIfAbsent(id, () => {'id': id, 'user': r['users'], 'count': 0});
        counts[id]!['count'] = (counts[id]!['count'] as int) + 1;
      }
      final leaderboard = counts.values.toList()
        ..sort((a, b) => (b['count'] as int).compareTo(a['count'] as int));
      if (mounted) setState(() => _leaderboard = leaderboard.take(10).toList());
    } catch (_) {}
  }

  Future<void> _generateCode(Map<String, dynamic> profile) async {
    if (_generatingCode) return;
    setState(() => _generatingCode = true);
    final uid  = supabase.auth.currentUser?.id ?? '';
    final name = (profile['full_name'] as String? ?? 'user')
        .toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
    final base = name.isEmpty ? 'user' : name.substring(0, math.min(8, name.length));
    for (int i = 0; i < 5; i++) {
      final code = '$base${1000 + math.Random().nextInt(9000)}';
      try {
        // Update the code
        await supabase.from('users').update({'referral_code': code}).eq('id', uid);
        // Re-read to confirm it was saved (avoids relying on update's return value)
        final check = await supabase.from('users').select('referral_code').eq('id', uid).single();
        final saved = check['referral_code'] as String?;
        if (saved != null && saved.isNotEmpty) {
          if (mounted) setState(() { _referralCode = saved; _generatingCode = false; });
          return;
        }
      } catch (_) { continue; }
    }
    if (mounted) setState(() => _generatingCode = false);
  }

  Future<void> _copyLink() async {
    if (_referralCode == null) return;
    await Clipboard.setData(ClipboardData(text: _referralLink));
    setState(() => _copied = true);
    Future.delayed(const Duration(seconds: 2), () { if (mounted) setState(() => _copied = false); });
  }

  Future<void> _shareWhatsApp() async {
    if (_referralCode == null) return;
    final text = 'Join me on PrimaPlug — the real-time labor marketplace! Find work or hire skilled people near you. Sign up here: $_referralLink';
    final uri  = Uri.parse('https://wa.me/?text=${Uri.encodeComponent(text)}');
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      await launchUrl(uri, mode: LaunchMode.platformDefault);
    }
  }

  Future<void> _shareTwitter() async {
    if (_referralCode == null) return;
    final text = "I'm on PrimaPlug — find work or hire skilled people in real time! Join with my link:";
    final uri  = Uri.parse('https://x.com/intent/tweet?text=${Uri.encodeComponent(text)}&url=${Uri.encodeComponent(_referralLink)}');
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      await launchUrl(uri, mode: LaunchMode.platformDefault);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(backgroundColor: _bg, body: Center(child: PrimaLoader()));
    }

    final completed           = _referrals.where((r) => r['status'] == 'completed').length;
    final creditsFromReferrals = completed * _kReferrerCredits;
    final pendingGigShares = _gigReferrals.where((r) => r['status'] == 'pending' && r['reward_given'] != true).length;
    final paidGigShares = _gigReferrals.where((r) => r['status'] == 'completed' && r['reward_given'] == true).length;
    final uid = supabase.auth.currentUser?.id ?? '';

    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: _dark), onPressed: () => context.pop()),
        title: const Text('Refer & Earn', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: _dark)),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        color: _purple,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 100),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            // Subtitle
            const Text('Invite people to Prima and earn trust score + Prima Credits', style: TextStyle(fontSize: 13, color: _muted)),
            const SizedBox(height: 20),

            // Rewards Banner
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF6C47FF), Color(0xFF9B59FF), Color(0xFFFF4DCF)], stops: [0, 0.5, 1]),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('FOR EACH SUCCESSFUL REFERRAL', style: TextStyle(fontSize: 11, color: Colors.white70, fontWeight: FontWeight.w700, letterSpacing: 1.2)),
                const SizedBox(height: 12),
                Row(children: [
                  Expanded(child: _rewardTile('+$_kReferrerTrust', 'Trust Score', 'You get')),
                  const SizedBox(width: 12),
                  Expanded(child: _rewardTile('$_kReferrerCredits', 'Prima Credits', 'You get')),
                ]),
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: Colors.white.withAlpha(25), borderRadius: BorderRadius.circular(10)),
                  child: Text('🎁 Your friend gets +$_kReferredTrust trust score and $_kReferredCredits Prima Credits when they complete their profile', style: const TextStyle(fontSize: 11, color: Colors.white, height: 1.5)),
                ),
              ]),
            ),
            const SizedBox(height: 16),

            // Stats Row
            Row(children: [
              Expanded(child: _statCard('👥', '${_referrals.length}', 'Total Referred', _purple)),
              const SizedBox(width: 10),
              Expanded(child: _statCard('✅', '$completed', 'Completed', _green)),
              const SizedBox(width: 10),
              Expanded(child: _statCard('⭐', '$creditsFromReferrals', 'Credits Earned', const Color(0xFFFFB800))),
            ]),
            const SizedBox(height: 16),

            _Card(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('GIG SHARE REWARDS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: _muted, letterSpacing: 1)),
                  SizedBox(height: 6),
                  Text(
                    'Share a gig. If your referred worker applies, gets accepted, and completes the work, you earn 5% of that gig payment.',
                    style: TextStyle(fontSize: 13, color: _dark, fontWeight: FontWeight.w600, height: 1.45),
                  ),
                ])),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                  decoration: BoxDecoration(color: const Color(0xFFDFFDF4), border: Border.all(color: const Color(0xFF7EECD2)), borderRadius: BorderRadius.circular(999)),
                  child: const Text('5% share', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF008E66))),
                ),
              ]),
              const SizedBox(height: 14),
              Row(children: [
                Expanded(child: _miniShareStat('Pending Work', '$pendingGigShares', const Color(0xFFFFB800), const Color(0xFFFFF8E0), const Color(0xFFFFD966))),
                const SizedBox(width: 10),
                Expanded(child: _miniShareStat('Paid Shares', '$paidGigShares', _green, const Color(0xFFDFFDF4), const Color(0xFF7EECD2))),
              ]),
            ])),
            const SizedBox(height: 14),

            // Referral Link Card
            _Card(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('YOUR REFERRAL LINK', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: _muted, letterSpacing: 1)),
              const SizedBox(height: 12),
              // Link row
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(color: const Color(0xFFF5F4FF), borderRadius: BorderRadius.circular(12)),
                child: Row(children: [
                  Expanded(child: Text(
                    _referralCode != null ? _referralLink : (_generatingCode ? 'Generating your referral link...' : 'Tap to generate your link'),
                    style: const TextStyle(fontSize: 12, color: _purple, fontWeight: FontWeight.w600),
                    overflow: TextOverflow.ellipsis,
                  )),
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: _referralCode != null ? _copyLink : null,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: _copied ? const Color(0xFFDFFDF4) : const Color(0xFFEEE9FF),
                        border: Border.all(color: _copied ? const Color(0xFF7EECD2) : const Color(0xFFB8A5FF), width: 1.5),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(_copied ? '✓ Copied!' : '📋 Copy', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _copied ? _green : _purple)),
                    ),
                  ),
                ]),
              ),
              const SizedBox(height: 12),
              // Code display
              Row(children: [
                Expanded(child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(color: const Color(0xFFEEE9FF), border: Border.all(color: const Color(0xFFB8A5FF), width: 1.5), borderRadius: BorderRadius.circular(10)),
                  child: Center(child: Text(
                    _referralCode != null ? _referralCode!.toUpperCase() : (_generatingCode ? 'CREATING...' : 'PENDING'),
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: _purple, letterSpacing: 2),
                  )),
                )),
                const SizedBox(width: 12),
                Expanded(child: const Text('Your unique referral code', style: TextStyle(fontSize: 11, color: _muted, height: 1.4))),
              ]),
              // Generate button — shown only when code is missing and not currently generating
              if (_referralCode == null && !_generatingCode) ...[
                const SizedBox(height: 14),
                GestureDetector(
                  onTap: () async {
                    final uid = supabase.auth.currentUser?.id;
                    if (uid == null) return;
                    final p = await supabase.from('users').select('full_name').eq('id', uid).single();
                    await _generateCode(p);
                  },
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [_purple, Color(0xFF9B59FF)]),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Center(child: Text('✨ Generate My Referral Link', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white))),
                  ),
                ),
              ],
              const SizedBox(height: 14),
              // Share buttons
              Row(children: [
                Expanded(child: _shareBtn('💬 WhatsApp', const Color(0xFF25D366), Colors.white, _shareWhatsApp, _referralCode != null)),
                const SizedBox(width: 8),
                Expanded(child: _shareBtn('🐦 Twitter', _dark, Colors.white, _shareTwitter, _referralCode != null)),
                const SizedBox(width: 8),
                Expanded(child: _shareBtn('🔗 Copy', const Color(0xFFF5F4FF), _muted, _copyLink, _referralCode != null, bdr: _border)),
              ]),
            ])),
            const SizedBox(height: 14),

            // How It Works
            _Card(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('HOW IT WORKS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: _muted, letterSpacing: 1)),
              const SizedBox(height: 14),
              ..._steps.asMap().entries.map((e) {
                final i = e.key;
                final s = e.value;
                return Container(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(border: Border(bottom: i < _steps.length - 1 ? const BorderSide(color: Color(0xFFF5F4FF)) : BorderSide.none)),
                  child: Row(children: [
                    Container(
                      width: 32, height: 32,
                      decoration: const BoxDecoration(gradient: LinearGradient(colors: [_purple, Color(0xFF9B59FF)]), shape: BoxShape.circle),
                      child: Center(child: Text('${i + 1}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Colors.white))),
                    ),
                    const SizedBox(width: 12),
                    Text(s.$1, style: const TextStyle(fontSize: 14)),
                    const SizedBox(width: 8),
                    Expanded(child: Text(s.$2, style: const TextStyle(fontSize: 13, color: _dark, fontWeight: FontWeight.w500))),
                  ]),
                );
              }),
            ])),
            const SizedBox(height: 14),

            // My Referrals
            if (_referrals.isNotEmpty) ...[
              _Card(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('MY REFERRALS (${_referrals.length})', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: _muted, letterSpacing: 1)),
                const SizedBox(height: 14),
                ..._referrals.asMap().entries.map((e) {
                  final i   = e.key;
                  final ref = e.value;
                  final referred  = ref['referred'] as Map? ?? {};
                  final name      = referred['full_name'] as String? ?? 'Unknown';
                  final avatarUrl = referred['avatar_url'] as String?;
                  final createdAt = ref['created_at'] as String?;
                  final joined    = createdAt != null
                      ? DateFormat('MMM d').format(parseTs(createdAt).toLocal())
                      : '';
                  final done      = ref['status'] == 'completed';
                  return Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(border: Border(bottom: i < _referrals.length - 1 ? const BorderSide(color: Color(0xFFF5F4FF)) : BorderSide.none)),
                    child: Row(children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: avatarUrl != null
                            ? CachedNetworkImage(imageUrl: avatarUrl, width: 36, height: 36, fit: BoxFit.cover, errorWidget: (ctx, url, err) => _initials(name, 36))
                            : _initials(name, 36),
                      ),
                      const SizedBox(width: 10),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _dark)),
                        if (joined.isNotEmpty) Text('Joined $joined', style: const TextStyle(fontSize: 10, color: _muted)),
                      ])),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                        decoration: BoxDecoration(
                          color: done ? const Color(0xFFDFFDF4) : const Color(0xFFFFF8E0),
                          border: Border.all(color: done ? const Color(0xFF7EECD2) : const Color(0xFFFFD966)),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(done ? '✓ +$_kReferrerCredits credits' : '⏳ Pending', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: done ? _green : const Color(0xFFFFB800))),
                      ),
                    ]),
                  );
                }),
              ])),
              const SizedBox(height: 14),
            ],

            if (_gigReferrals.isNotEmpty) ...[
              _Card(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('MY GIG SHARES (${_gigReferrals.length})', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: _muted, letterSpacing: 1)),
                const SizedBox(height: 14),
                ..._gigReferrals.asMap().entries.map((e) {
                  final i = e.key;
                  final ref = e.value;
                  final worker = ref['referred'] as Map? ?? {};
                  final gig = ref['gigs'] as Map? ?? {};
                  final title = gig['title'] as String? ?? 'Shared gig';
                  final workerName = worker['full_name'] as String? ?? 'Worker';
                  final avatarUrl = worker['avatar_url'] as String?;
                  final isPaid = ref['status'] == 'completed' && ref['reward_given'] == true;
                  final currency = ref['reward_currency'] as String? ?? gig['currency'] as String? ?? 'NGN';
                  final amount = ((ref['reward_amount'] as num?) ?? 0).toDouble();
                  final createdAt = ref['created_at'] as String?;
                  final date = createdAt != null ? DateFormat('MMM d').format(parseTs(createdAt).toLocal()) : '';
                  return Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(border: Border(bottom: i < _gigReferrals.length - 1 ? const BorderSide(color: Color(0xFFF5F4FF)) : BorderSide.none)),
                    child: Row(children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: avatarUrl != null
                            ? CachedNetworkImage(imageUrl: avatarUrl, width: 36, height: 36, fit: BoxFit.cover, errorWidget: (ctx, url, err) => _initials(workerName, 36))
                            : _initials(workerName, 36),
                      ),
                      const SizedBox(width: 10),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _dark), maxLines: 1, overflow: TextOverflow.ellipsis),
                        Text('$workerName${date.isNotEmpty ? ' · $date' : ''}', style: const TextStyle(fontSize: 10, color: _muted)),
                      ])),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                        decoration: BoxDecoration(
                          color: isPaid ? const Color(0xFFDFFDF4) : const Color(0xFFFFF8E0),
                          border: Border.all(color: isPaid ? const Color(0xFF7EECD2) : const Color(0xFFFFD966)),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          isPaid ? '$currency ${NumberFormat('#,##0').format(amount)} paid' : 'Pending completion',
                          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: isPaid ? const Color(0xFF00A876) : const Color(0xFFFFB800)),
                        ),
                      ),
                    ]),
                  );
                }),
              ])),
              const SizedBox(height: 14),
            ],

            // Withdraw Credits
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFDFFDF4), Color(0xFFE8FFF5)]),
                border: Border.all(color: const Color(0xFF7EECD2), width: 1.5),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('💸 Withdraw Your Credits', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: _dark)),
                    const SizedBox(height: 2),
                    Text('Convert credits to cash · $_kCreditsPerDollar credits = \$1', style: const TextStyle(fontSize: 12, color: _muted)),
                  ]),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(color: _green, borderRadius: BorderRadius.circular(10)),
                    child: Text(_credits.toStringAsFixed(0), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white)),
                  ),
                ]),
                const SizedBox(height: 12),
                GestureDetector(
                  onTap: () => context.push('/withdraw-credits'),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [Color(0xFF00C48C), Color(0xFF00A876)]),
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: const [BoxShadow(color: Color(0x4D00C48C), blurRadius: 16, offset: Offset(0, 4))],
                    ),
                    child: const Center(child: Text('💸 Withdraw Credits', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white))),
                  ),
                ),
              ]),
            ),

            // Leaderboard
            if (_leaderboard.isNotEmpty) ...[
              const SizedBox(height: 14),
              _Card(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('🏆 TOP REFERRERS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: _muted, letterSpacing: 1)),
                const SizedBox(height: 14),
                ..._leaderboard.asMap().entries.map((e) {
                  final i      = e.key;
                  final item   = e.value;
                  final user   = item['user'] as Map? ?? {};
                  final name   = user['full_name'] as String? ?? 'Unknown';
                  final avUrl  = user['avatar_url'] as String?;
                  final trust  = ((user['trust_score'] as num?) ?? 100).toInt();
                  final isMe   = item['id'] == uid;
                  final medals = ['🥇', '🥈', '🥉'];
                  final isFirst = i == 0;
                  return Container(
                    margin: isMe ? const EdgeInsets.symmetric(vertical: 2) : EdgeInsets.zero,
                    padding: EdgeInsets.symmetric(horizontal: isMe ? 10.0 : 0, vertical: 10),
                    decoration: BoxDecoration(
                      color: isMe ? const Color(0xFFF8F7FF) : Colors.transparent,
                      borderRadius: isMe ? BorderRadius.circular(10) : BorderRadius.zero,
                      border: Border(bottom: i < _leaderboard.length - 1 ? const BorderSide(color: Color(0xFFF5F4FF)) : BorderSide.none),
                    ),
                    child: Row(children: [
                      SizedBox(width: 28, child: Center(child: i < 3
                          ? Text(medals[i], style: const TextStyle(fontSize: 20))
                          : Text('#${i + 1}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _muted)))),
                      const SizedBox(width: 10),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(9),
                        child: avUrl != null
                            ? CachedNetworkImage(imageUrl: avUrl, width: 34, height: 34, fit: BoxFit.cover, errorWidget: (ctx, url, err) => _initials(name, 34))
                            : _initials(name, 34),
                      ),
                      const SizedBox(width: 10),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('$name${isMe ? ' (You)' : ''}', style: TextStyle(fontSize: 13, fontWeight: isMe ? FontWeight.w700 : FontWeight.w500, color: isMe ? _purple : _dark)),
                        Text('Trust $trust%', style: const TextStyle(fontSize: 10, color: _muted)),
                      ])),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: isFirst ? const Color(0xFFFFF8E0) : const Color(0xFFF5F4FF),
                          border: Border.all(color: isFirst ? const Color(0xFFFFD966) : _border),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Column(children: [
                          Text('${item['count']}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: isFirst ? const Color(0xFFFFB800) : _purple)),
                          const Text('referrals', style: TextStyle(fontSize: 8, color: _muted, letterSpacing: 0.2)),
                        ]),
                      ),
                    ]),
                  );
                }),
              ])),
            ],
          ]),
        ),
      ),
    );
  }

  static const _steps = [
    ('🔗', 'Share your link with friends'),
    ('👤', 'They sign up using your link'),
    ('✅', 'They complete their profile'),
    ('🎉', 'You both get rewarded instantly'),
  ];

  Widget _rewardTile(String val, String label, String sub) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(color: Colors.white.withAlpha(38), borderRadius: BorderRadius.circular(14)),
    child: Column(children: [
      Text(val, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: Colors.white)),
      const SizedBox(height: 3),
      Text(label, style: const TextStyle(fontSize: 11, color: Colors.white70)),
      const SizedBox(height: 2),
      Text(sub, style: const TextStyle(fontSize: 10, color: Colors.white60)),
    ]),
  );

  Widget _statCard(String icon, String val, String label, Color color) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(color: Colors.white, border: Border.all(color: _border, width: 1.5), borderRadius: BorderRadius.circular(14)),
    child: Column(children: [
      Text(icon, style: const TextStyle(fontSize: 20)),
      const SizedBox(height: 4),
      Text(val, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color)),
      const SizedBox(height: 3),
      Text(label, style: const TextStyle(fontSize: 9, color: Color(0xFFA09DC8), fontWeight: FontWeight.w600, letterSpacing: 0.4), textAlign: TextAlign.center),
    ]),
  );

  Widget _miniShareStat(String label, String val, Color color, Color bg, Color bdr) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(color: bg, border: Border.all(color: bdr), borderRadius: BorderRadius.circular(12)),
    child: Column(children: [
      Text(val, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color)),
      const SizedBox(height: 3),
      Text(label, style: const TextStyle(fontSize: 9, color: Color(0xFF6F7190), fontWeight: FontWeight.w700, letterSpacing: 0.4), textAlign: TextAlign.center),
    ]),
  );

  Widget _shareBtn(String label, Color bg, Color fg, VoidCallback fn, bool enabled, {Color? bdr}) => GestureDetector(
    onTap: enabled ? fn : null,
    child: Opacity(
      opacity: enabled ? 1.0 : 0.6,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(color: bg, border: bdr != null ? Border.all(color: bdr, width: 1.5) : null, borderRadius: BorderRadius.circular(12)),
        child: Center(child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: fg))),
      ),
    ),
  );

  static Widget _initials(String name, double size) => Container(
    width: size, height: size,
    decoration: const BoxDecoration(color: Color(0xFFEEE9FF)),
    child: Center(child: Text(name.isNotEmpty ? name[0].toUpperCase() : '?', style: TextStyle(fontSize: size * 0.36, fontWeight: FontWeight.w800, color: _purple))),
  );
}

// ─── SHARED CARD WIDGET ──────────────────────────────────────────────────────

class _Card extends StatelessWidget {
  final Widget child;
  const _Card({required this.child});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(color: Colors.white, border: Border.all(color: _border, width: 1.5), borderRadius: BorderRadius.circular(16)),
    child: child,
  );
}

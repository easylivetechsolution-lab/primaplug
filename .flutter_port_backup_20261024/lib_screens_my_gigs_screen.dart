import 'dart:async';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../main.dart';
import '../utils/dt.dart';
import '../widgets/brand_icon.dart';
import '../widgets/prima_loader.dart';
import 'live_tracking_screen.dart';

const _purple = Color(0xFF6C47FF);
const _green = Color(0xFF00C48C);
const _dark = Color(0xFF14123A);
const _muted = Color(0xFF8B8FAF);
const _sub = Color(0xFF6F7394);
const _bg = Color(0xFFF8F7FF);
const _border = Color(0xFFE2E0FF);
const _inputBg = Color(0xFFF5F4FF);
const _red = Color(0xFFFF3366);
const _orange = Color(0xFFFF6B2B);

String _timeAgo(String? d) {
  if (d == null) return '';
  final diff = DateTime.now().difference(parseTs(d).toLocal());
  if (diff.inSeconds < 60) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  return '${(diff.inDays / 7).floor()}w ago';
}

String _timeLeft(String? d) {
  if (d == null) return '';
  final diff = parseTs(d).toLocal().difference(DateTime.now());
  if (diff.isNegative) return 'Expired';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m left';
  if (diff.inHours < 24) return '${diff.inHours}h left';
  if (diff.inDays == 1) return '1 day left';
  return '${diff.inDays} days left';
}

int _daysSince(String? d) {
  if (d == null) return 0;
  return DateTime.now().difference(parseTs(d).toLocal()).inDays;
}

String _sym(String? code) {
  const m = {'NGN': '₦', 'USD': '\$', 'GBP': '£', 'EUR': '€', 'GHS': '₵', 'KES': 'KSh', 'ZAR': 'R'};
  return m[code ?? 'USD'] ?? '\$';
}

Map? _firstWhere(List items, bool Function(Map) test) {
  for (final item in items) {
    if (item is Map && test(item)) return item;
  }
  return null;
}

class _SC {
  final Color color, bg, border;
  final String label;
  const _SC({required this.color, required this.bg, required this.border, required this.label});
}

_SC _postedConf(String status, int n) {
  switch (status) {
    case 'hasapplicants':
      return _SC(color: _red, bg: const Color(0xFFFFE8EE), border: const Color(0xFFFF99B3), label: '$n Applicant${n > 1 ? 's' : ''}');
    case 'inprogress':
      return _SC(color: _orange, bg: const Color(0xFFFFF0E8), border: const Color(0xFFFFBC99), label: 'In Progress');
    case 'waiting':
      return _SC(color: _purple, bg: const Color(0xFFEEE9FF), border: const Color(0xFFB8A5FF), label: 'Awaiting Confirmation');
    case 'completed':
      return _SC(color: _muted, bg: _inputBg, border: _border, label: 'Completed');
    case 'expired':
      return _SC(color: const Color(0xFFA09DC8), bg: _inputBg, border: _border, label: 'Expired');
    default:
      return _SC(color: _green, bg: const Color(0xFFDFFDF4), border: const Color(0xFF7EECD2), label: 'Open');
  }
}

_SC _workingConf(String status) {
  switch (status) {
    case 'inprogress':
      return _SC(color: _orange, bg: const Color(0xFFFFF0E8), border: const Color(0xFFFFBC99), label: '🎉 You Got This Job!');
    case 'confirmreceipt':
      return _SC(color: _red, bg: const Color(0xFFFFE8EE), border: const Color(0xFFFF99B3), label: '⚡ Action Required');
    case 'completed':
      return _SC(color: _green, bg: const Color(0xFFDFFDF4), border: const Color(0xFF7EECD2), label: '✅ Completed');
    case 'declined':
      return _SC(color: _muted, bg: _inputBg, border: _border, label: 'Not Selected');
    default:
      return _SC(color: _purple, bg: const Color(0xFFEEE9FF), border: const Color(0xFFB8A5FF), label: 'Applied');
  }
}

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────────

class MyGigsScreen extends StatefulWidget {
  const MyGigsScreen({super.key});
  @override
  State<MyGigsScreen> createState() => _MyGigsScreenState();
}

class _MyGigsScreenState extends State<MyGigsScreen> with SingleTickerProviderStateMixin {
  late TabController _tab;
  bool _loading = true;
  List<Map<String, dynamic>> _posts = [];
  List<Map<String, dynamic>> _jobs = [];
  List<Map<String, dynamic>> _actions = [];
  bool _showActions = false;
  RealtimeChannel? _channel;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 2, vsync: this);
    _tab.addListener(() { if (mounted) setState(() {}); });
    _fetchAll();
    _subscribe();
  }

  @override
  void dispose() {
    _tab.dispose();
    if (_channel != null) supabase.removeChannel(_channel!);
    super.dispose();
  }

  // ── Status logic ──────────────────────────────────────────────────────────

  String _postedStatus(Map<String, dynamic> gig) {
    final receipts = gig['receipts'] as List?;
    final receipt = (receipts != null && receipts.isNotEmpty) ? receipts.first as Map : null;
    final apps = (gig['applications'] as List? ?? []);
    final pendingApps = apps.where((a) => (a as Map)['status'] == 'pending').toList();
    final acceptedApp = _firstWhere(apps.cast<Map>().toList(), (a) => a['status'] == 'accepted');
    if (receipt?['completed'] == true) return 'completed';
    if (receipt?['poster_confirmed'] == true && receipt?['worker_confirmed'] != true) return 'waiting';
    if (gig['status'] == 'in_progress' || acceptedApp != null) return 'inprogress';
    if (pendingApps.isNotEmpty) return 'hasapplicants';
    final exp = gig['expires_at'] as String?;
    if (exp != null && parseTs(exp).isBefore(DateTime.now())) return 'expired';
    return 'open';
  }

  String _workingStatus(Map<String, dynamic> app) {
    final gig = app['gigs'] as Map?;
    final receipts = gig?['receipts'] as List?;
    final receipt = (receipts != null && receipts.isNotEmpty) ? receipts.first as Map : null;
    if (receipt?['completed'] == true) return 'completed';
    if (receipt?['poster_confirmed'] == true && receipt?['worker_confirmed'] != true) return 'confirmreceipt';
    if (app['status'] == 'accepted') return 'inprogress';
    if (app['status'] == 'declined') return 'declined';
    return 'pending';
  }

  int get _postedActionCount => _posts.where((g) {
    final s = _postedStatus(g); return s == 'hasapplicants' || s == 'waiting';
  }).length;
  int get _workingActionCount => _jobs.where((a) => _workingStatus(a) == 'confirmreceipt').length;
  int get _totalActionCount => _postedActionCount + _workingActionCount;
  int get _postedInProgress => _posts.where((g) => _postedStatus(g) == 'inprogress').length;
  int get _workingInProgress => _jobs.where((a) => _workingStatus(a) == 'inprogress').length;

  // ── Data ──────────────────────────────────────────────────────────────────

  void _subscribe() {
    final uid = supabase.auth.currentUser?.id;
    if (uid == null) return;
    _channel = supabase
        .channel('my-gigs-$uid')
        .onPostgresChanges(event: PostgresChangeEvent.all, schema: 'public', table: 'gigs', callback: (_) => _fetchAll())
        .onPostgresChanges(event: PostgresChangeEvent.all, schema: 'public', table: 'applications', callback: (_) => _fetchAll())
        .onPostgresChanges(event: PostgresChangeEvent.all, schema: 'public', table: 'receipts', callback: (_) => _fetchAll())
        .subscribe();
  }

  Future<void> _fetchAll() async {
    if (!mounted) return;
    setState(() => _loading = true);
    final uid = supabase.auth.currentUser?.id;
    if (uid == null) { setState(() => _loading = false); return; }
    try {
      final results = await Future.wait([
        supabase.from('gigs').select('''
          *,
          applications(id, status, worker_id, accepted_at,
            users:users!applications_worker_id_fkey(id, full_name, avatar_url, rating, trust_score, level)
          ),
          receipts(id, amount, currency, poster_confirmed, worker_confirmed, completed, disputed),
          worker:users!gigs_worker_id_fkey(id, full_name, avatar_url, rating, trust_score)
        ''').eq('poster_id', uid).neq('status', 'completed').isFilter('deleted_at', null).order('created_at', ascending: false),

        supabase.from('applications').select('''
          id, status, created_at, accepted_at, worker_id,
          gigs(*,
            receipts(id, amount, currency, poster_confirmed, worker_confirmed, completed, disputed),
            poster:users!gigs_poster_id_fkey(id, full_name, avatar_url, rating, trust_score)
          )
        ''').eq('worker_id', uid).inFilter('status', ['pending', 'accepted']).order('created_at', ascending: false),
      ]);

      List<Map<String, dynamic>> actions = [];
      try {
        final r = await supabase.rpc('get_user_actions', params: {'p_user_id': uid});
        if (r != null) {
          actions = List<Map<String, dynamic>>.from(r as List);
          actions.sort((a, b) => (a['priority'] as int? ?? 99).compareTo(b['priority'] as int? ?? 99));
        }
      } catch (_) {}

      if (!mounted) return;
      setState(() {
        _posts = List<Map<String, dynamic>>.from(results[0] as List);
        _jobs = (results[1] as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .where((e) => e['gigs'] != null && (e['gigs'] as Map)['deleted_at'] == null)
            .toList();
        _actions = actions;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  Future<void> _acceptApplication(Map<String, dynamic> gig, Map<String, dynamic> application) async {
    final isWallet = gig['payment_method'] == 'wallet';
    try {
      if (isWallet) {
        final amount = (gig['pay_min'] as num?)?.toDouble() ?? 0;
        final ok = await supabase.rpc('lock_gig_escrow', params: {
          'p_user_id': gig['poster_id'],
          'p_gig_id': gig['id'],
          'p_amount': amount,
          'p_currency': gig['currency'] ?? 'NGN',
        });
        if (ok == false || ok == null) {
          if (mounted) _alert('Insufficient Balance', 'Your wallet balance is not enough. Please fund your wallet.');
          return;
        }
      }

      await supabase.from('applications').update({
        'status': 'accepted',
        'accepted_at': DateTime.now().toIso8601String(),
      }).eq('id', application['id']);

      final gigUpd = <String, dynamic>{
        'status': 'in_progress',
        'worker_id': application['worker_id'],
        'worker_name': (application['users'] as Map?)?['full_name'],
        'accepted_at': DateTime.now().toIso8601String(),
      };
      if (isWallet) gigUpd['escrow_amount'] = gig['pay_min'];
      await supabase.from('gigs').update(gigUpd).eq('id', gig['id']);

      await supabase.from('notifications').insert({
        'user_id': application['worker_id'],
        'title': isWallet ? '🎉 You Got The Job! Payment secured in escrow.' : '🎉 You Got The Job!',
        'message': 'Your application for "${gig['title']}" was accepted!',
        'type': 'accepted',
        'gig_id': gig['id'],
      });

      // Decline others
      final apps = (gig['applications'] as List? ?? []).cast<Map>();
      final others = apps.where((a) => a['id'] != application['id'] && a['status'] == 'pending').toList();
      if (others.isNotEmpty) {
        await supabase.from('applications')
            .update({'status': 'declined'})
            .eq('gig_id', gig['id'])
            .neq('id', application['id'])
            .eq('status', 'pending');
        await supabase.from('notifications').insert(
          others.map((a) => {
            'user_id': a['worker_id'],
            'title': 'Application Update',
            'message': 'Your application for "${gig['title']}" was not selected.',
            'type': 'rejected',
            'gig_id': gig['id'],
          }).toList(),
        );
      }

      await _fetchAll();
      if (mounted) _alert('Success', isWallet ? 'Application accepted! Funds locked in escrow.' : 'Application accepted! Worker notified.');
    } catch (e) {
      if (mounted) _alert('Error', 'Failed to accept: $e');
    }
  }

  Future<void> _declineApplication(Map<String, dynamic> application, String gigTitle, String gigId) async {
    await supabase.from('applications').update({'status': 'declined'}).eq('id', application['id']);
    await supabase.from('notifications').insert({
      'user_id': application['worker_id'],
      'title': 'Application Update',
      'message': 'Your application for "$gigTitle" was not selected.',
      'type': 'rejected',
      'gig_id': gigId,
    });
    await _fetchAll();
  }

  Future<void> _deleteGig(String gigId) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete Gig?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete', style: TextStyle(color: _red))),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    final current = await supabase.from('gigs').select('status, expires_at, applications(id, status)').eq('id', gigId).maybeSingle();
    if (current == null) return;

    // Always block if a worker is actively on the job, regardless of expiry
    if (current['status'] == 'in_progress') {
      if (mounted) _alert('Cannot Delete', 'A worker is actively on this job. Complete or resolve it before deleting.');
      return;
    }

    final expStr = current['expires_at'] as String?;
    final isExpired = expStr != null && parseTs(expStr).isBefore(DateTime.now());
    final isCompleted = current['status'] == 'completed';
    final apps = (current['applications'] as List? ?? []).cast<Map>();
    final hasAccepted = apps.any((a) => a['status'] == 'accepted');
    if (hasAccepted && !isExpired && !isCompleted) {
      if (mounted) _alert('Cannot Delete', 'A worker has been accepted for this gig. Complete or resolve it before deleting.');
      return;
    }
    // Notify pending applicants
    final pendingApps = apps.where((a) => a['status'] == 'pending').toList();
    if (pendingApps.isNotEmpty) {
      await supabase.from('notifications').insert(pendingApps.map((a) => {
        'user_id': a['worker_id'],
        'title': 'Gig Removed',
        'message': 'A gig you applied for has been removed by the poster.',
        'type': 'rejected',
        'gig_id': null,
      }).toList());
    }

    await supabase.from('gigs').update({'deleted_at': DateTime.now().toUtc().toIso8601String()}).eq('id', gigId);
    await _fetchAll();
  }

  Future<void> _posterMarkDone(Map<String, dynamic> gig) async {
    final isWallet = gig['payment_method'] == 'wallet';
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(isWallet ? 'Mark Job Complete?' : 'Confirm Payment?'),
        content: Text(isWallet
          ? 'This will release the escrowed funds to the worker.'
          : 'Confirm that payment has been made. The worker will then verify.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Confirm', style: TextStyle(color: _green))),
        ],
      ),
    );
    if (ok != true) return;
    try {
      if (isWallet) {
        final amount = ((gig['escrow_amount'] ?? gig['pay_min']) as num?)?.toDouble() ?? 0;
        await supabase.rpc('release_gig_escrow', params: {
          'p_gig_id': gig['id'],
          'p_poster_id': gig['poster_id'],
          'p_worker_id': gig['worker_id'],
          'p_amount': amount,
          'p_currency': gig['currency'] ?? 'NGN',
        });
        await supabase.from('gigs').update({'status': 'completed'}).eq('id', gig['id']);
        if (gig['worker_id'] != null) {
          await supabase.from('notifications').insert({
            'user_id': gig['worker_id'],
            'title': '💸 Payment Released!',
            'message': 'Your payment for "${gig['title']}" has been released to your wallet.',
            'type': 'wallet',
            'gig_id': gig['id'],
          });
        }
      } else {
        final receipts = gig['receipts'] as List?;
        final existing = (receipts != null && receipts.isNotEmpty) ? receipts.first as Map : null;
        if (existing != null) {
          await supabase.from('receipts').update({'poster_confirmed': true}).eq('id', existing['id']);
        } else {
          await supabase.from('receipts').insert({
            'gig_id': gig['id'],
            'poster_id': gig['poster_id'],
            'worker_id': gig['worker_id'],
            'amount': gig['pay_min'],
            'currency': gig['currency'] ?? 'USD',
            'poster_confirmed': true,
          });
        }
      }
      await _fetchAll();
    } catch (e) {
      if (mounted) _alert('Error', 'Failed: $e');
    }
  }

  Future<void> _workerConfirmReceipt(Map<String, dynamic> gig, bool confirm) async {
    try {
      final receipts = gig['receipts'] as List?;
      final receipt = (receipts != null && receipts.isNotEmpty) ? receipts.first as Map : null;
      if (receipt == null) return;
      await supabase.from('receipts').update({
        'worker_confirmed': confirm,
        'disputed': !confirm,
        'completed': confirm,
      }).eq('id', receipt['id']);
      if (confirm) {
        await supabase.from('gigs').update({'status': 'completed'}).eq('id', gig['id']);
      }
      await _fetchAll();
    } catch (e) {
      if (mounted) _alert('Error', '$e');
    }
  }

  void _alert(String title, String msg) {
    if (!mounted) return;
    showDialog(context: context, builder: (_) => AlertDialog(
      title: Text(title),
      content: Text(msg),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK'))],
    ));
  }

  void _showApplicants(Map<String, dynamic> gig) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ApplicantsSheet(
        gig: gig,
        onAccept: (app) async {
          Navigator.pop(context);
          await _acceptApplication(gig, Map<String, dynamic>.from(app));
        },
        onDecline: (app) async {
          Navigator.pop(context);
          await _declineApplication(Map<String, dynamic>.from(app), gig['title'] as String? ?? '', gig['id'] as String? ?? '');
        },
        onChat: (userId, gigId) {
          Navigator.pop(context);
          _openChat(userId, gigId);
        },
      ),
    );
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        child: Column(children: [
          _buildHeader(),
          if (_loading)
            const Expanded(child: Center(child: PrimaLoader()))
          else
            Expanded(child: TabBarView(
              controller: _tab,
              children: [_buildPostsTab(), _buildJobsTab()],
            )),
        ]),
      ),
    );
  }

  Widget _buildHeader() {
    final total = _posts.length + _jobs.length;
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.white, Color(0xFFF8F7FF)]),
        border: Border(bottom: BorderSide(color: _border, width: 1.5)),
        boxShadow: [BoxShadow(color: Color(0x0F14123A), blurRadius: 30, offset: Offset(0, 10))],
      ),
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('My Gigs', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: _dark, height: 1.05)),
              const SizedBox(height: 5),
              const Text('Manage your posted work and active jobs', style: TextStyle(fontSize: 13, color: _sub, fontWeight: FontWeight.w600)),
            ])),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(color: _dark, borderRadius: BorderRadius.circular(14),
                boxShadow: const [BoxShadow(color: Color(0x2914123A), blurRadius: 22, offset: Offset(0, 10))]),
              child: Column(children: [
                Text('$total', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Colors.white, height: 1)),
                const SizedBox(height: 4),
                const Text('TOTAL', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Color(0xFFC9C6FF), letterSpacing: 0.6)),
              ]),
            ),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
          child: Row(children: [
            Expanded(child: _StatBox(label: 'Posted', value: _posts.length, color: _purple)),
            const SizedBox(width: 8),
            Expanded(child: _StatBox(label: 'Working', value: _jobs.length, color: _green)),
            const SizedBox(width: 8),
            Expanded(child: _StatBox(label: 'Active', value: _postedInProgress + _workingInProgress, color: _orange)),
          ]),
        ),
        if (_totalActionCount > 0) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
            child: GestureDetector(
              onTap: () => setState(() => _showActions = !_showActions),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(color: const Color(0xFFFFE8EE), borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFFF99B3), width: 1.5)),
                child: Row(children: [
                  Container(width: 22, height: 22, decoration: const BoxDecoration(color: _red, shape: BoxShape.circle),
                    child: Center(child: Text('$_totalActionCount', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.white)))),
                  const SizedBox(width: 8),
                  Expanded(child: Text('$_totalActionCount thing${_totalActionCount > 1 ? 's' : ''} need your attention',
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _red))),
                  Text(_showActions ? '▲' : '▼', style: const TextStyle(fontSize: 12, color: _red)),
                ]),
              ),
            ),
          ),
          if (_showActions && _actions.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
              child: Container(
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: _border, width: 1.5)),
                child: Column(children: _actions.asMap().entries.map((e) {
                  final i = e.key;
                  final a = e.value;
                  final p = a['priority'] as int? ?? 99;
                  final dot = p <= 2 ? _red : p <= 4 ? _orange : _purple;
                  return GestureDetector(
                    onTap: () {
                      setState(() => _showActions = false);
                      final type = a['action_type'] as String?;
                      if (type == 'review_applicants') {
                        final gig = _posts.where((g) => g['id'] == a['gig_id']).toList();
                        if (gig.isNotEmpty) _showApplicants(gig.first);
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                      decoration: BoxDecoration(border: i < _actions.length - 1 ? const Border(bottom: BorderSide(color: _inputBg)) : null),
                      child: Row(children: [
                        Container(width: 8, height: 8, decoration: BoxDecoration(color: dot, shape: BoxShape.circle)),
                        const SizedBox(width: 10),
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(a['title'] as String? ?? '', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _dark)),
                          Text(a['gig_title'] as String? ?? '', style: const TextStyle(fontSize: 10, color: _muted)),
                        ])),
                        const Text('→', style: TextStyle(fontSize: 12, color: _muted)),
                      ]),
                    ),
                  );
                }).toList()),
              ),
            ),
        ],
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(children: [
            _TabBtn(label: 'My Posts', iconName: 'mygigs', badge: _postedActionCount, active: _tab.index == 0, onTap: () => _tab.animateTo(0)),
            _TabBtn(label: 'My Jobs', iconName: 'saved', badge: _workingActionCount, active: _tab.index == 1, onTap: () => _tab.animateTo(1)),
          ]),
        ),
      ]),
    );
  }

  Future<void> _openChat(String otherUserId, String gigId) async {
    final me = Supabase.instance.client.auth.currentUser;
    if (me == null || otherUserId.isEmpty) return;
    final sb = Supabase.instance.client;
    try {
      final data = await sb
        .from('conversations')
        .select('id')
        .or(
          'and(participant_1.eq.${me.id},participant_2.eq.$otherUserId),'
          'and(participant_1.eq.$otherUserId,participant_2.eq.${me.id})',
        )
        .order('last_message_at', ascending: false)
        .limit(1);
      final list = (data as List).cast<Map<String, dynamic>>();
      String? convoId = list.isNotEmpty ? list.first['id'] as String? : null;
      if (convoId == null) {
        final created = await sb
          .from('conversations')
          .insert({
            'gig_id': null,
            'participant_1': me.id,
            'participant_2': otherUserId,
            'last_message': '',
            'last_message_at': DateTime.now().toIso8601String(),
          })
          .select('id')
          .single();
        convoId = created['id'] as String?;
      }
      if (convoId != null && mounted) context.push('/chat/$convoId');
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not open chat')));
    }
  }

  Widget _buildPostsTab() {
    if (_posts.isEmpty) return _empty('📋', 'No gigs posted yet', 'Tap + to post your first gig');
    final action = _posts.where((g) { final s = _postedStatus(g); return s == 'hasapplicants' || s == 'waiting'; }).toList();
    final inprog = _posts.where((g) => _postedStatus(g) == 'inprogress').toList();
    final open = _posts.where((g) => _postedStatus(g) == 'open').toList();
    final expired = _posts.where((g) => _postedStatus(g) == 'expired').toList();
    final done = _posts.where((g) => _postedStatus(g) == 'completed').toList();

    Widget card(Map<String, dynamic> g) => _PostedCard(
      key: ValueKey(g['id']), gig: g, status: _postedStatus(g),
      onViewApplicants: _showApplicants, onMarkDone: _posterMarkDone,
      onDelete: _deleteGig, onChat: _openChat);

    return RefreshIndicator(
      onRefresh: _fetchAll, color: _purple,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 100), children: [
        if (action.isNotEmpty) _GigCarousel(title: 'Needs Action', count: action.length, color: _red, children: action.map(card).toList()),
        if (inprog.isNotEmpty) _GigCarousel(title: 'In Progress', count: inprog.length, color: _orange, children: inprog.map(card).toList()),
        if (open.isNotEmpty) _GigCarousel(title: 'Open', count: open.length, color: _green, children: open.map(card).toList()),
        if (expired.isNotEmpty) _GigCarousel(title: 'Expired', count: expired.length, color: _muted, children: expired.map(card).toList()),
        if (done.isNotEmpty) _GigCarousel(title: 'Completed', count: done.length, color: _muted, children: done.map(card).toList()),
      ]),
    );
  }

  Widget _buildJobsTab() {
    if (_jobs.isEmpty) return _empty('⚡', 'No applications yet', 'Browse Feed or Map and apply to gigs');
    final action = _jobs.where((a) => _workingStatus(a) == 'confirmreceipt').toList();
    final inprog = _jobs.where((a) => _workingStatus(a) == 'inprogress').toList();
    final pending = _jobs.where((a) => _workingStatus(a) == 'pending').toList();
    final done = _jobs.where((a) => _workingStatus(a) == 'completed').toList();

    Widget card(Map<String, dynamic> a) => _WorkingCard(
      key: ValueKey(a['id']), app: a, status: _workingStatus(a),
      onConfirm: _workerConfirmReceipt, onChat: _openChat);

    return RefreshIndicator(
      onRefresh: _fetchAll, color: _purple,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 100), children: [
        if (action.isNotEmpty) _GigCarousel(title: 'Action Required', count: action.length, color: _red, children: action.map(card).toList()),
        if (inprog.isNotEmpty) _GigCarousel(title: 'In Progress', count: inprog.length, color: _orange, children: inprog.map(card).toList()),
        if (pending.isNotEmpty) _GigCarousel(title: 'Pending', count: pending.length, color: _purple, children: pending.map(card).toList()),
        if (done.isNotEmpty) _GigCarousel(title: 'Completed', count: done.length, color: _muted, children: done.map(card).toList()),
      ]),
    );
  }

  Widget _empty(String icon, String title, String sub) {
    return Center(child: Padding(padding: const EdgeInsets.all(40), child: Column(mainAxisSize: MainAxisSize.min, children: [
      Text(icon, style: const TextStyle(fontSize: 48)),
      const SizedBox(height: 16),
      Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: _dark)),
      const SizedBox(height: 6),
      Text(sub, textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, color: _muted, height: 1.5)),
    ])));
  }
}

// ─── SHARED SMALL WIDGETS ────────────────────────────────────────────────────

class _GigCarousel extends StatelessWidget {
  final String title;
  final int count;
  final Color color;
  final List<Widget> children;
  const _GigCarousel({required this.title, required this.count, required this.color, required this.children});

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.only(top: 10, bottom: 8),
        child: Row(children: [
          Container(width: 10, height: 10, decoration: BoxDecoration(
            color: color, shape: BoxShape.circle,
            boxShadow: [BoxShadow(color: color.withValues(alpha: 0.3), blurRadius: 6, spreadRadius: 2)])),
          const SizedBox(width: 8),
          Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: _dark)),
          const Spacer(),
          Container(padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), border: Border.all(color: _border)),
            child: Text('$count', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: color))),
        ]),
      ),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        clipBehavior: Clip.none,
        padding: const EdgeInsets.only(right: 4, bottom: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: children.map((c) => SizedBox(
            width: MediaQuery.of(context).size.width * 0.86,
            child: Padding(padding: const EdgeInsets.only(right: 12), child: c),
          )).toList(),
        ),
      ),
    ]);
  }
}

class _StatBox extends StatelessWidget {
  final String label; final int value; final Color color;
  const _StatBox({required this.label, required this.value, required this.color});
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14),
      border: Border.all(color: _border, width: 1.5),
      boxShadow: const [BoxShadow(color: Color(0x0D14123A), blurRadius: 18, offset: Offset(0, 8))]),
    child: Column(children: [
      Text('$value', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: color, height: 1)),
      const SizedBox(height: 4),
      Text(label.toUpperCase(), style: const TextStyle(fontSize: 10, color: _sub, fontWeight: FontWeight.w700, letterSpacing: 0.7)),
    ]),
  );
}

class _TabBtn extends StatelessWidget {
  final String label, iconName; final int badge; final bool active; final VoidCallback onTap;
  const _TabBtn({required this.label, required this.iconName, required this.badge, required this.active, required this.onTap});
  @override
  Widget build(BuildContext context) => Expanded(child: GestureDetector(onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: active ? _purple : Colors.transparent, width: 2.5))),
      child: Stack(alignment: Alignment.center, children: [
        Column(mainAxisSize: MainAxisSize.min, children: [
          BrandIcon(name: iconName, size: 26, active: active),
          const SizedBox(height: 3),
          Text(label, style: TextStyle(fontSize: 11, fontWeight: active ? FontWeight.w700 : FontWeight.w500, color: active ? _purple : _muted)),
        ]),
        if (badge > 0) Positioned(top: 0, right: 20,
          child: Container(width: 16, height: 16, decoration: const BoxDecoration(color: _red, shape: BoxShape.circle),
            child: Center(child: Text('$badge', style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: Colors.white))))),
      ]),
    ),
  ));
}

class _SecHead extends StatelessWidget {
  final String title; final int count; final Color color;
  const _SecHead({required this.title, required this.count, required this.color});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 16, bottom: 10),
    child: Row(children: [
      Container(width: 10, height: 10, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
      const SizedBox(width: 8),
      Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: _dark)),
      const Spacer(),
      Container(padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), border: Border.all(color: _border)),
        child: Text('$count', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: color))),
    ]),
  );
}

class _Avatar extends StatelessWidget {
  final String? url, name; final double size;
  const _Avatar({this.url, this.name, this.size = 32});
  @override
  Widget build(BuildContext context) {
    final r = size * 0.28;
    if (url != null && url!.isNotEmpty) {
      return ClipRRect(borderRadius: BorderRadius.circular(r),
        child: CachedNetworkImage(imageUrl: url!, width: size, height: size, fit: BoxFit.cover,
          errorWidget: (ctx, obj, err) => _fallback(r)));
    }
    return _fallback(r);
  }
  Widget _fallback(double r) {
    final init = (name?.isNotEmpty == true) ? name!.substring(0, 1).toUpperCase() : '?';
    return Container(width: size, height: size,
      decoration: BoxDecoration(color: const Color(0xFFEEE9FF), borderRadius: BorderRadius.circular(r), border: Border.all(color: const Color(0xFFB8A5FF), width: 1.5)),
      child: Center(child: Text(init, style: TextStyle(fontSize: size * 0.38, fontWeight: FontWeight.w800, color: _purple))));
  }
}

class _GradBtn extends StatelessWidget {
  final String label; final List<Color> colors; final VoidCallback onTap;
  const _GradBtn({required this.label, required this.colors, required this.onTap});
  @override
  Widget build(BuildContext context) => GestureDetector(onTap: onTap,
    child: Container(width: double.infinity, padding: const EdgeInsets.symmetric(vertical: 13),
      decoration: BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: colors),
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(color: colors.first.withValues(alpha: 0.35), blurRadius: 16, offset: const Offset(0, 4))]),
      child: Center(child: Text(label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white)))));
}

class _OutBtn extends StatelessWidget {
  final String label; final IconData icon; final Color color; final Color? bg, bc; final VoidCallback onTap;
  const _OutBtn({required this.label, required this.icon, required this.color, this.bg, this.bc, required this.onTap});
  @override
  Widget build(BuildContext context) => GestureDetector(onTap: onTap,
    child: Container(padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(color: bg ?? _inputBg, borderRadius: BorderRadius.circular(10), border: Border.all(color: bc ?? _border, width: 1.5)),
      child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(icon, size: 14, color: color), const SizedBox(width: 5),
        Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color)),
      ])));
}

// ─── POSTED GIG CARD ─────────────────────────────────────────────────────────

class _PostedCard extends StatefulWidget {
  final Map<String, dynamic> gig;
  final String status;
  final void Function(Map<String, dynamic>) onViewApplicants;
  final void Function(Map<String, dynamic>) onMarkDone;
  final void Function(String) onDelete;
  final void Function(String userId, String gigId) onChat;
  const _PostedCard({super.key, required this.gig, required this.status, required this.onViewApplicants, required this.onMarkDone, required this.onDelete, required this.onChat});
  @override
  State<_PostedCard> createState() => _PostedCardState();
}

class _PostedCardState extends State<_PostedCard> {
  bool _exp = false;

  @override
  Widget build(BuildContext context) {
    final g = widget.gig;
    final st = widget.status;
    final apps = (g['applications'] as List? ?? []);
    final pending = apps.where((a) => (a as Map)['status'] == 'pending').toList().cast<Map>();
    final acceptedApp = _firstWhere(apps.cast<Map>().toList(), (a) => a['status'] == 'accepted');
    final worker = g['worker'] as Map? ?? (acceptedApp?['users'] as Map?) ?? {};
    final acceptedAt = g['accepted_at'] as String? ?? acceptedApp?['accepted_at'] as String?;
    final receipts = g['receipts'] as List?;
    final receipt = (receipts != null && receipts.isNotEmpty) ? receipts.first as Map : null;
    final sym = _sym(g['currency'] as String?);
    final payMin = g['pay_min'] as num?;
    final payMax = g['pay_max'] as num?;
    final tl = g['expires_at'] != null ? _timeLeft(g['expires_at'] as String) : null;
    final isWallet = g['payment_method'] == 'wallet';
    final daysSince = _daysSince(acceptedAt);
    final conf = _postedConf(st, pending.length);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16),
        border: Border.all(color: conf.border, width: 1.5),
        boxShadow: const [BoxShadow(color: Color(0x0F14123A), blurRadius: 28, offset: Offset(0, 12))]),
      clipBehavior: Clip.antiAlias,
      child: Column(children: [
        // ── Header ──
        GestureDetector(
          onTap: () => setState(() => _exp = !_exp),
          child: Container(color: Colors.white, padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Container(padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                    decoration: BoxDecoration(color: conf.bg, borderRadius: BorderRadius.circular(6), border: Border.all(color: conf.border)),
                    child: Text(conf.label.toUpperCase(), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: conf.color, letterSpacing: 0.5))),
                  const SizedBox(height: 6),
                  Text(g['title'] as String? ?? '', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: _dark, height: 1.25), maxLines: 2, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 6),
                  Text('$sym${payMin?.toStringAsFixed(0) ?? '?'}–$sym${payMax?.toStringAsFixed(0) ?? '?'} · ${g['location'] ?? 'Remote'} · ${_timeAgo(g['created_at'] as String?)}',
                    style: const TextStyle(fontSize: 12, color: _sub, fontWeight: FontWeight.w600, height: 1.35)),
                  if (tl != null) ...[
                    const SizedBox(height: 5),
                    Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                      decoration: BoxDecoration(color: tl == 'Expired' ? const Color(0xFFFFE8EE) : _inputBg,
                        borderRadius: BorderRadius.circular(5), border: Border.all(color: tl == 'Expired' ? const Color(0xFFFF99B3) : _border)),
                      child: Text(tl, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: tl == 'Expired' ? _red : _muted))),
                  ],
                ])),
                const SizedBox(width: 8),
                AnimatedRotation(turns: _exp ? 0.5 : 0, duration: const Duration(milliseconds: 200),
                  child: const Icon(Icons.keyboard_arrow_down_rounded, color: _muted, size: 20)),
              ]),
              // Worker chip
              if ((st == 'inprogress' || st == 'waiting') && worker.isNotEmpty) ...[
                const SizedBox(height: 8),
                GestureDetector(
                  onTap: () { final id = worker['id'] as String?; if (id != null) context.push('/user/$id'); },
                  child: Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(color: _inputBg, borderRadius: BorderRadius.circular(10)),
                    child: Row(children: [
                      _Avatar(url: worker['avatar_url'] as String?, name: worker['full_name'] as String?, size: 28),
                      const SizedBox(width: 8),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(worker['full_name'] as String? ?? '', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _dark)),
                        Text('⭐ ${worker['rating'] ?? 5.0} · Working since ${_timeAgo(acceptedAt)}', style: const TextStyle(fontSize: 10, color: _muted)),
                      ])),
                      const Icon(Icons.chevron_right_rounded, size: 16, color: _muted),
                    ])),
                ),
              ],
              // Applicant avatars
              if (st == 'hasapplicants' && pending.isNotEmpty) ...[
                const SizedBox(height: 8),
                Row(children: [
                  ...pending.take(3).map((a) => Padding(padding: const EdgeInsets.only(right: 4),
                    child: _Avatar(url: (a['users'] as Map?)?['avatar_url'] as String?, name: (a['users'] as Map?)?['full_name'] as String?, size: 28))),
                  if (pending.length > 3) Text('+${pending.length - 3} more', style: const TextStyle(fontSize: 11, color: _purple, fontWeight: FontWeight.w700)),
                ]),
              ],
            ])),
        ),
        // ── Action area ──
        Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          decoration: const BoxDecoration(color: Color(0xFFFAFAFA), border: Border(top: BorderSide(color: _inputBg))),
          child: Column(children: [
            if (st == 'hasapplicants')
              _GradBtn(label: '👥 Review ${pending.length} Applicant${pending.length > 1 ? 's' : ''} →',
                colors: [_purple, const Color(0xFF9B59FF)], onTap: () => widget.onViewApplicants(g)),

            if (st == 'inprogress') ...[
              if (daysSince >= 3 && !isWallet)
                Container(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8), margin: const EdgeInsets.only(bottom: 10),
                  decoration: BoxDecoration(color: const Color(0xFFFFF0E8), borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFFFBC99))),
                  child: Row(children: [
                    const Text('⚠️', style: TextStyle(fontSize: 14)), const SizedBox(width: 6),
                    Expanded(child: Text('${(worker['full_name'] as String? ?? 'Worker').split(' ').first} has been working $daysSince days. Have you paid them?',
                      style: const TextStyle(fontSize: 11, color: _orange, fontWeight: FontWeight.w600))),
                  ])),
              Container(padding: const EdgeInsets.all(12), margin: const EdgeInsets.only(bottom: 10),
                decoration: BoxDecoration(color: const Color(0xFFEEE9FF), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFB8A5FF), width: 1.5)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(isWallet ? '💰 Funds in Escrow' : '📎 Ready to upload receipt?',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _purple)),
                  const SizedBox(height: 3),
                  Text(isWallet
                    ? '$sym${((g['escrow_amount'] ?? g['pay_min']) as num?)?.toStringAsFixed(0) ?? '?'} locked. Tap Done when ${(worker['full_name'] as String? ?? 'worker').split(' ').first} finishes.'
                    : 'When you\'ve paid ${(worker['full_name'] as String? ?? 'the worker').split(' ').first}, confirm the payment here.',
                    style: const TextStyle(fontSize: 11, color: _purple, height: 1.4)),
                  const SizedBox(height: 8),
                  _GradBtn(
                    label: isWallet ? '✓ Mark Done →' : 'Upload Receipt →',
                    colors: isWallet ? [_green, const Color(0xFF00A878)] : [_purple, const Color(0xFF9B59FF)],
                    onTap: () => widget.onMarkDone(g)),
                ])),
              Row(children: [
                Expanded(child: _OutBtn(label: 'Message', icon: Icons.chat_bubble_outline_rounded, color: _purple, onTap: () => widget.onChat(worker['id'] as String? ?? '', g['id'] as String? ?? ''))),
                if (g['type'] == 'physical') ...[
                  const SizedBox(width: 8),
                  Expanded(child: _OutBtn(label: 'Track', icon: Icons.location_on_outlined, color: _orange, bg: const Color(0xFFFFF0E8), bc: const Color(0xFFFFBC99), onTap: () {
                    Navigator.of(context, rootNavigator: true).push(MaterialPageRoute(builder: (_) => LiveTrackingScreen(
                      gig: g, role: 'poster', workerInfo: worker,
                    )));
                  })),
                ],
              ]),
            ],

            if (st == 'waiting') ...[
              Container(padding: const EdgeInsets.all(14), margin: const EdgeInsets.only(bottom: 10),
                decoration: BoxDecoration(color: const Color(0xFFEEE9FF), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFB8A5FF), width: 1.5)),
                child: Row(children: [
                  const Icon(Icons.hourglass_top_rounded, color: _purple, size: 20), const SizedBox(width: 8),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Waiting for ${(worker['full_name'] as String? ?? 'worker').split(' ').first} to confirm',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _purple)),
                    if (receipt != null) Text('You confirmed ${_sym(receipt['currency'] as String?)}${(receipt['amount'] as num?)?.toStringAsFixed(0) ?? '?'}',
                      style: const TextStyle(fontSize: 11, color: _purple, height: 1.4)),
                  ])),
                ])),
              _OutBtn(label: 'Message ${(worker['full_name'] as String? ?? '').split(' ').first}', icon: Icons.chat_bubble_outline_rounded, color: _purple, onTap: () => widget.onChat(worker['id'] as String? ?? '', g['id'] as String? ?? '')),
            ],

            if (st == 'completed')
              Row(children: [
                const Icon(Icons.check_circle_rounded, color: _green, size: 16), const SizedBox(width: 6),
                Expanded(child: Text('${_sym(receipt?['currency'] as String?)}${(receipt?['amount'] as num?)?.toStringAsFixed(0) ?? '?'} · Completed',
                  style: const TextStyle(fontSize: 12, color: _green, fontWeight: FontWeight.w600))),
              ]),

            if (st == 'expired')
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(color: _inputBg, borderRadius: BorderRadius.circular(10), border: Border.all(color: _border)),
                child: Row(children: [
                  const Icon(Icons.timer_off_rounded, size: 15, color: _muted),
                  const SizedBox(width: 6),
                  const Expanded(child: Text('This gig has expired and is no longer visible to workers.',
                    style: TextStyle(fontSize: 11, color: _muted, height: 1.4))),
                ])),

            if (st != 'completed' && st != 'expired') ...[
              const SizedBox(height: 12),
              _OutBtn(label: 'Edit', icon: Icons.edit_outlined, color: _muted, onTap: () {}),
            ],
          ]),
        ),
      ]),
    );
  }
}

// ─── WORKING GIG CARD ────────────────────────────────────────────────────────

class _WorkingCard extends StatelessWidget {
  final Map<String, dynamic> app;
  final String status;
  final void Function(Map<String, dynamic>, bool) onConfirm;
  final void Function(String userId, String gigId) onChat;
  const _WorkingCard({super.key, required this.app, required this.status, required this.onConfirm, required this.onChat});

  @override
  Widget build(BuildContext context) {
    final gig = (app['gig'] ?? app['gigs']) as Map<String, dynamic>? ?? {};
    final poster = gig['poster'] as Map? ?? {};
    final receipts = gig['receipts'] as List?;
    final receipt = (receipts != null && receipts.isNotEmpty) ? receipts.first as Map : null;
    final sym = _sym(gig['currency'] as String?);
    final payMin = gig['pay_min'] as num?;
    final payMax = gig['pay_max'] as num?;
    final isWallet = gig['payment_method'] == 'wallet';
    final posterName = poster['full_name'] as String? ?? 'Poster';
    final conf = _workingConf(status);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16),
        border: Border.all(color: conf.border, width: 1.5),
        boxShadow: const [BoxShadow(color: Color(0x0F14123A), blurRadius: 28, offset: Offset(0, 12))]),
      clipBehavior: Clip.antiAlias,
      child: Column(children: [
        Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
            decoration: BoxDecoration(color: conf.bg, borderRadius: BorderRadius.circular(6), border: Border.all(color: conf.border)),
            child: Text(conf.label.toUpperCase(), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: conf.color, letterSpacing: 0.5))),
          const SizedBox(height: 8),
          Text(gig['title'] as String? ?? '', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: _dark, height: 1.25), maxLines: 2, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 8),
          GestureDetector(
            onTap: () { final id = poster['id'] as String?; if (id != null) context.push('/user/$id'); },
            child: Row(children: [
              _Avatar(url: poster['avatar_url'] as String?, name: posterName, size: 24),
              const SizedBox(width: 8),
              Text(posterName, style: const TextStyle(fontSize: 12, color: _purple, fontWeight: FontWeight.w600)),
              const SizedBox(width: 4),
              const Icon(Icons.chevron_right_rounded, size: 14, color: _purple),
              const SizedBox(width: 6), const Text('·', style: TextStyle(fontSize: 11, color: _muted)), const SizedBox(width: 6),
              Expanded(child: Text(gig['location'] as String? ?? 'Remote', style: const TextStyle(fontSize: 12, color: _muted), overflow: TextOverflow.ellipsis)),
            ]),
          ),
          const SizedBox(height: 8),
          Text('$sym${payMin?.toStringAsFixed(0) ?? '?'}–$sym${payMax?.toStringAsFixed(0) ?? '?'}',
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Color(0xFF008E66))),
        ])),
        Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          decoration: const BoxDecoration(color: Color(0xFFFAFAFA), border: Border(top: BorderSide(color: _inputBg))),
          child: Column(children: [
            if (status == 'pending')
              Row(children: [
                Expanded(child: Text('Waiting for a response · Applied ${_timeAgo(app['created_at'] as String?)}', style: const TextStyle(fontSize: 12, color: _muted))),
                const SizedBox(width: 8),
                _OutBtn(label: 'Message', icon: Icons.chat_bubble_outline_rounded, color: _purple, onTap: () => onChat(poster['id'] as String? ?? '', gig['id'] as String? ?? '')),
              ]),

            if (status == 'inprogress') ...[
              Container(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10), margin: const EdgeInsets.only(bottom: 10),
                decoration: BoxDecoration(color: const Color(0xFFDFFDF4), borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFF7EECD2))),
                child: Text('You\'ve been accepted! Do the work and wait for ${posterName.split(' ').first} to confirm ${isWallet ? 'completion' : 'payment'}.',
                  style: const TextStyle(fontSize: 12, color: _green, fontWeight: FontWeight.w600))),
              Row(children: [
                Expanded(child: _OutBtn(label: 'Message', icon: Icons.chat_bubble_outline_rounded, color: _purple, onTap: () => onChat(poster['id'] as String? ?? '', gig['id'] as String? ?? ''))),
                if (gig['type'] == 'physical') ...[
                  const SizedBox(width: 8),
                  Expanded(child: _OutBtn(label: 'Track', icon: Icons.location_on_outlined, color: _orange, bg: const Color(0xFFFFF0E8), bc: const Color(0xFFFFBC99), onTap: () {
                    Navigator.of(context, rootNavigator: true).push(MaterialPageRoute(builder: (_) => LiveTrackingScreen(
                      gig: gig, role: 'worker', posterInfo: poster,
                    )));
                  })),
                ],
              ]),
            ],

            if (status == 'confirmreceipt') ...[
              Container(padding: const EdgeInsets.all(14), margin: const EdgeInsets.only(bottom: 10),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFFFF0E8), Color(0xFFFFE8EE)]),
                  borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFFF99B3), width: 1.5)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${posterName.split(' ').first} confirmed your payment',
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _orange, letterSpacing: 0.8)),
                  const SizedBox(height: 6),
                  Text('${_sym(receipt?['currency'] as String?)}${(receipt?['amount'] as num?)?.toStringAsFixed(0) ?? '?'}',
                    style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: _dark, height: 1)),
                  const SizedBox(height: 2),
                  Text('${receipt?['currency'] ?? 'USD'} · Is this what you received?', style: const TextStyle(fontSize: 12, color: _muted)),
                ])),
              Row(children: [
                Expanded(child: GestureDetector(onTap: () => onConfirm(gig, false),
                  child: Container(padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(color: const Color(0xFFFFE8EE), borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFFF99B3), width: 1.5)),
                    child: const Center(child: Text('✗ Dispute', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _red)))))),
                const SizedBox(width: 8),
                Expanded(flex: 2, child: GestureDetector(onTap: () => onConfirm(gig, true),
                  child: Container(padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [_green, Color(0xFF00A878)]),
                      borderRadius: BorderRadius.circular(10),
                      boxShadow: const [BoxShadow(color: Color(0x5900C48C), blurRadius: 12, offset: Offset(0, 3))]),
                    child: const Center(child: Text('✓ Confirm & Complete →', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white)))))),
              ]),
            ],

            if (status == 'completed')
              Row(children: [
                const Icon(Icons.check_circle_rounded, color: _green, size: 16), const SizedBox(width: 6),
                Expanded(child: Text('Earned ${_sym(receipt?['currency'] as String?)}${(receipt?['amount'] as num?)?.toStringAsFixed(0) ?? (payMax?.toStringAsFixed(0) ?? '?')}',
                  style: const TextStyle(fontSize: 13, color: _green, fontWeight: FontWeight.w700))),
                Text(_timeAgo(app['accepted_at'] as String?), style: const TextStyle(fontSize: 11, color: _muted)),
              ]),
          ]),
        ),
      ]),
    );
  }
}

// ─── APPLICANTS SHEET ────────────────────────────────────────────────────────

class _ApplicantsSheet extends StatelessWidget {
  final Map<String, dynamic> gig;
  final void Function(Map) onAccept;
  final void Function(Map) onDecline;
  final void Function(String userId, String gigId) onChat;
  const _ApplicantsSheet({required this.gig, required this.onAccept, required this.onDecline, required this.onChat});

  @override
  Widget build(BuildContext context) {
    final apps = (gig['applications'] as List? ?? []).cast<Map>();
    final pending = apps.where((a) => a['status'] == 'pending').toList();

    return Container(
      decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.only(topLeft: Radius.circular(22), topRight: Radius.circular(22))),
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 40, height: 4, margin: const EdgeInsets.only(top: 12), decoration: BoxDecoration(color: _border, borderRadius: BorderRadius.circular(2))),
        Padding(padding: const EdgeInsets.fromLTRB(20, 20, 20, 0), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Applicants', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: _dark)),
          const SizedBox(height: 4),
          Text('${pending.length} people applied for "${gig['title']}"', style: const TextStyle(fontSize: 13, color: _muted)),
          const SizedBox(height: 16),
        ])),
        Flexible(child: pending.isEmpty
          ? const Center(child: Padding(padding: EdgeInsets.all(32), child: Text('No pending applicants', style: TextStyle(color: _muted))))
          : ListView.builder(
              shrinkWrap: true,
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              itemCount: pending.length,
              itemBuilder: (_, i) {
                final app = pending[i];
                final user = app['users'] as Map? ?? {};
                final name = user['full_name'] as String? ?? 'Unknown';
                final userId = user['id'] as String? ?? '';
                return Container(padding: const EdgeInsets.all(14), margin: const EdgeInsets.only(bottom: 10),
                  decoration: BoxDecoration(color: _inputBg, borderRadius: BorderRadius.circular(14), border: Border.all(color: _border, width: 1.5)),
                  child: Column(children: [
                    GestureDetector(
                      onTap: () { if (userId.isNotEmpty) context.push('/user/$userId'); },
                      child: Row(children: [
                        _Avatar(url: user['avatar_url'] as String?, name: name, size: 44),
                        const SizedBox(width: 10),
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('$name →', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: _purple)),
                          const SizedBox(height: 2),
                          Text('⭐ ${user['rating'] ?? 5.0} · Trust ${user['trust_score'] ?? 100}% · ${user['level'] ?? 'New'}',
                            style: const TextStyle(fontSize: 11, color: _muted)),
                        ])),
                      ]),
                    ),
                    const SizedBox(height: 12),
                    Row(children: [
                      Expanded(child: GestureDetector(onTap: () => onChat(userId, gig['id'] as String? ?? ''),
                        child: Container(padding: const EdgeInsets.symmetric(vertical: 10),
                          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10), border: Border.all(color: _border, width: 1.5)),
                          child: const Center(child: Text('💬 Chat', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _purple)))))),
                      const SizedBox(width: 8),
                      Expanded(child: GestureDetector(onTap: () => onDecline(app),
                        child: Container(padding: const EdgeInsets.symmetric(vertical: 10),
                          decoration: BoxDecoration(color: const Color(0xFFFFE8EE), borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFFF99B3), width: 1.5)),
                          child: const Center(child: Text('✗ Decline', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _red)))))),
                      const SizedBox(width: 8),
                      Expanded(flex: 2, child: GestureDetector(onTap: () => onAccept(app),
                        child: Container(padding: const EdgeInsets.symmetric(vertical: 10),
                          decoration: BoxDecoration(gradient: const LinearGradient(colors: [_green, Color(0xFF00A878)]), borderRadius: BorderRadius.circular(10),
                            boxShadow: const [BoxShadow(color: Color(0x4D00C48C), blurRadius: 12, offset: Offset(0, 3))]),
                          child: const Center(child: Text('✓ Accept', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white)))))),
                    ]),
                  ]));
              })),
      ]),
    );
  }
}

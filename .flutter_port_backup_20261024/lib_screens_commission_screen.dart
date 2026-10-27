import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../main.dart';
import '../utils/dt.dart';
import '../widgets/brand_icon.dart';
import '../widgets/prima_loader.dart';

const _purple = Color(0xFF6C47FF);
const _green  = Color(0xFF00C48C);
const _dark   = Color(0xFF14123A);
const _muted  = Color(0xFF8B8FAF);
const _border = Color(0xFFE2E0FF);
const _bg     = Color(0xFFF8F7FF);

const _kRate    = 0.10;
const _kCredPer = 50.0;

const _kCurrSym = {'USD': '\$', 'NGN': '₦', 'GHS': '₵', 'KES': 'KSh', 'ZAR': 'R', 'EUR': '€', 'GBP': '£'};

String _sym(String c) => _kCurrSym[c] ?? '\$';

int _daysUntilDue(String? dueIso) {
  if (dueIso == null) return 0;
  try {
    final diff = parseTs(dueIso).difference(DateTime.now());
    return diff.inDays;
  } catch (_) { return 0; }
}

Color _dueBadgeColor(String status, int days) {
  if (status == 'paid') return _green;
  if (status == 'overdue') return Colors.red;
  if (days < 3) return const Color(0xFFFF6B2B);
  if (days < 7) return const Color(0xFFFFB800);
  return _muted;
}

class CommissionScreen extends StatefulWidget {
  const CommissionScreen({super.key});
  @override
  State<CommissionScreen> createState() => _CommissionScreenState();
}

class _CommissionScreenState extends State<CommissionScreen> {
  List<Map<String, dynamic>> _pending  = [];
  List<Map<String, dynamic>> _paid     = [];
  // keyed by currency code e.g. {'NGN': 5000.0, 'USD': 10.0}
  Map<String, double>        _wallets  = {};
  int    _credits        = 0;
  bool   _loading  = true;
  bool   _paying   = false;
  String? _payingId;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    final uid = supabase.auth.currentUser?.id;
    if (uid == null) { if (mounted) setState(() => _loading = false); return; }

    // Load wallets (one per currency)
    try {
      final rows = await supabase.from('wallets').select('currency, balance').eq('user_id', uid);
      if (mounted) {
        setState(() {
          _wallets = { for (final r in (rows as List)) (r as Map)['currency'] as String: ((r['balance'] as num?) ?? 0).toDouble() };
        });
      }
    } catch (_) {}

    // Prima credits — separate query so a missing column can't break wallet display
    try {
      final p = await supabase.from('users').select('prima_credits').eq('id', uid).single();
      if (mounted) setState(() => _credits = ((p['prima_credits'] as num?) ?? 0).toInt());
    } catch (_) {}

    // Commissions — no gig join (the Dart SDK join fails silently; map_screen also avoids it)
    try {
      final raw = await supabase
          .from('commissions')
          .select('*')
          .eq('worker_id', uid)
          .order('created_at', ascending: false);
      final all = (raw as List).cast<Map<String, dynamic>>();

      // De-duplicate by gig_id (mirrors web uniqueCommissions logic)
      final seen = <String>{};
      final unique = <Map<String, dynamic>>[];
      for (final c in all) {
        final key = (c['gig_id'] ?? c['id']) as String;
        if (seen.add(key)) unique.add(c);
      }

      // Fetch gig titles separately (no join) — failures here don't block display
      final gigIds = unique.map((c) => c['gig_id']).whereType<String>().toSet().toList();
      if (gigIds.isNotEmpty) {
        try {
          final gigs = await supabase.from('gigs').select('id, title, category').inFilter('id', gigIds);
          final gigMap = { for (final g in (gigs as List)) (g as Map)['id'] as String: g };
          for (final c in unique) {
            if (c['gig_id'] != null) c['gigs'] = gigMap[c['gig_id'] as String];
          }
        } catch (_) {}
      }

      if (mounted) {
        setState(() {
          _pending = unique.where((c) {
            final s = c['status'] as String? ?? '';
            return s == 'pending' || s == 'overdue';
          }).toList();
          _paid = unique.where((c) => c['status'] == 'paid').toList();
        });
      }
    } catch (e) {
      if (kDebugMode) debugPrint('commissions error: $e');
    }

    if (mounted) setState(() => _loading = false);
  }

  Future<void> _payFincra(Map<String, dynamic> commission) async {
    final uid = supabase.auth.currentUser?.id;
    if (uid == null || _paying) return;
    setState(() { _paying = true; _payingId = commission['id'] as String; });
    try {
      final amount   = ((commission['commission_amount'] as num?) ?? 0).toDouble();
      final currency = commission['currency'] as String? ?? 'USD';
      final res = await supabase.functions.invoke('fincra-fund-wallet', body: {
        'userId': uid,
        'amount': amount,
        'currency': currency,
        'reference': 'comm_${commission['id']}',
        'description': 'Commission payment for ${(commission['gigs'] as Map?)?['title'] ?? 'gig'}',
      });
      final checkoutUrl = (res.data as Map<String, dynamic>?)?['data']?['checkoutUrl'] as String?;
      if (checkoutUrl != null && checkoutUrl.isNotEmpty) {
        await launchUrl(Uri.parse(checkoutUrl), mode: LaunchMode.externalApplication);
      } else {
        _showError('Could not generate payment link');
      }
    } catch (e) {
      _showError('Payment error: ${e.toString()}');
    } finally {
      if (mounted) setState(() { _paying = false; _payingId = null; });
    }
  }

  Future<void> _payCredits(Map<String, dynamic> commission) async {
    final uid = supabase.auth.currentUser?.id;
    if (uid == null || _paying) return;
    final amount        = ((commission['commission_amount'] as num?) ?? 0).toDouble();
    final creditsNeeded = (amount * _kCredPer).ceil();
    if (_credits < creditsNeeded) {
      _showError('Need $creditsNeeded credits (you have $_credits)');
      return;
    }
    setState(() { _paying = true; _payingId = commission['id'] as String; });
    try {
      await supabase.rpc('spend_credits', params: {
        'p_user_id':    uid,
        'p_amount':     creditsNeeded,
        'p_type':       'commission',
        'p_description': 'Commission for ${(commission['gigs'] as Map?)?['title'] ?? 'gig'}',
      });
      await supabase.from('commissions').update({'status': 'paid', 'payment_method': 'credits', 'paid_at': DateTime.now().toIso8601String()}).eq('id', commission['id'] as String);
      await supabase.rpc('check_commission_status', params: {'p_worker_id': uid});
      _showSuccess('Paid with $creditsNeeded credits');
      await _load();
    } catch (e) {
      _showError('Failed: ${e.toString()}');
    } finally {
      if (mounted) setState(() { _paying = false; _payingId = null; });
    }
  }

  Future<void> _payWallet(Map<String, dynamic> commission) async {
    final uid = supabase.auth.currentUser?.id;
    if (uid == null || _paying) return;
    final commAmount = _commAmount(commission);
    final commCur    = commission['currency'] as String? ?? 'NGN';
    final walBal     = _wallets[commCur] ?? 0.0;

    if (!_wallets.containsKey(commCur)) {
      _showError('You don\'t have a $commCur wallet. Please pay via Fincra or credits.');
      return;
    }
    if (walBal < commAmount) {
      _showError('Insufficient $commCur balance (${_sym(commCur)}${walBal.toStringAsFixed(2)})');
      return;
    }
    setState(() { _paying = true; _payingId = commission['id'] as String; });
    try {
      final result = await supabase.rpc('_debit_wallet', params: {
        'p_user_id': uid,
        'p_currency': commCur,
        'p_amount': commAmount,
      });
      if (result == null) throw Exception('Insufficient balance');
      await supabase.from('commissions').update({'status': 'paid', 'payment_method': 'wallet', 'paid_at': DateTime.now().toIso8601String()}).eq('id', commission['id'] as String);
      await supabase.from('wallet_transactions').insert({'user_id': uid, 'amount': commAmount, 'currency': commCur, 'type': 'commission', 'description': 'Commission for ${(commission['gigs'] as Map?)?['title'] ?? 'gig'}'});
      await supabase.rpc('check_commission_status', params: {'p_worker_id': uid});
      _showSuccess('Commission paid from wallet');
      await _load();
    } catch (e) {
      _showError('Failed: ${e.toString()}');
    } finally {
      if (mounted) setState(() { _paying = false; _payingId = null; });
    }
  }

  void _showError(String msg) {
    if (!mounted) return;
    primaSnack(context, msg, isError: true);
  }

  void _showSuccess(String msg) {
    if (!mounted) return;
    primaSnack(context, msg, isSuccess: true);
  }

  double _commAmount(Map c) =>
      ((c['commission_amount'] as num?) ?? (c['amount'] as num?) ?? 0).toDouble();

  double get _totalOwed => _pending.fold<double>(0, (s, c) => s + _commAmount(c));
  bool   get _hasOwed   => _pending.isNotEmpty;
  bool   get _hasOverdue => _pending.any((c) => c['status'] == 'overdue' || _daysUntilDue(c['due_date'] as String?) < 0);

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(backgroundColor: _bg, body: Center(child: PrimaLoader()));
    }
    final credits = _credits;

    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: _dark), onPressed: () => context.pop()),
        title: const Text('Commission', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: _dark)),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        color: _purple,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            // Warning banner
            if (_hasOverdue) Container(
              margin: const EdgeInsets.only(bottom: 14),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: const Color(0xFFFFF0F0), border: Border.all(color: Colors.red.shade200), borderRadius: BorderRadius.circular(12)),
              child: const Row(children: [
                Icon(Icons.warning_amber_rounded, color: Colors.red, size: 18),
                SizedBox(width: 8),
                Expanded(child: Text('You have overdue commissions. Your gig posting may be restricted until paid.', style: TextStyle(fontSize: 12, color: Colors.red, fontWeight: FontWeight.w500), maxLines: 2)),
              ]),
            ),

            // Balance cards
            Row(children: [
              Expanded(child: _balCard(
                label: 'Commission Owed',
                value: !_hasOwed
                    ? 'All Clear'
                    : _totalOwed > 0
                        ? NumberFormat('#,##0.00').format(_totalOwed)
                        : '${_pending.length} pending',
                sub: !_hasOwed ? 'No pending commissions' : '${_pending.length} unpaid',
                color: !_hasOwed ? _green : Colors.red,
                icon: 'commission',
              )),
              const SizedBox(width: 10),
              Expanded(child: _balCard(
                label: 'Prima Credits',
                value: NumberFormat('#,##0').format(credits),
                sub: '${NumberFormat('#,##0.00').format(credits / _kCredPer)} USD worth',
                color: _purple,
                icon: 'credits',
              )),
            ]),
            const SizedBox(height: 16),

            // Wallet balance info
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: Colors.white, border: Border.all(color: _border, width: 1.5), borderRadius: BorderRadius.circular(14)),
              child: Row(children: [
                const Text('💳', style: TextStyle(fontSize: 20)),
                const SizedBox(width: 10),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Wallet Balance', style: TextStyle(fontSize: 11, color: _muted, fontWeight: FontWeight.w600)),
                  Text(
                    _wallets.isEmpty
                        ? 'No wallet yet'
                        : _wallets.entries.map((e) => '${_sym(e.key)}${NumberFormat('#,##0.00').format(e.value)} ${e.key}').join('  |  '),
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _dark),
                  ),
                ])),
                TextButton(onPressed: () => context.push('/wallet'), child: const Text('Top Up', style: TextStyle(fontSize: 12, color: _purple, fontWeight: FontWeight.w700))),
              ]),
            ),
            const SizedBox(height: 20),

            if (_pending.isEmpty && _paid.isEmpty) ...[
              _empty(),
            ] else ...[
              if (_pending.isNotEmpty) ...[
                const Text('Pending Commissions', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: _dark)),
                const Text('10% of your gig earnings — pay within the due date', style: TextStyle(fontSize: 11, color: _muted)),
                const SizedBox(height: 12),
                ..._pending.map((c) => _pendingCard(c, credits)),
                const SizedBox(height: 20),
              ],
              if (_paid.isNotEmpty) ...[
                const Text('Paid History', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: _dark)),
                const SizedBox(height: 12),
                ..._paid.map(_paidCard),
              ],
            ],
          ]),
        ),
      ),
    );
  }

  Widget _pendingCard(Map<String, dynamic> c, int credits) {
    final gig      = (c['gigs'] as Map<String, dynamic>?) ?? {};
    final status   = c['status'] as String? ?? '';
    final amount   = ((c['commission_amount'] as num?) ?? 0).toDouble();
    final earned   = amount / _kRate;
    final cur      = c['currency'] as String? ?? 'NGN';
    final dueIso   = c['due_date'] as String?;
    final days     = _daysUntilDue(dueIso);
    final badgeColor    = _dueBadgeColor(status, days);
    final creditsNeeded = (amount * _kCredPer).ceil();
    final isBusy        = _paying && _payingId == c['id'];
    final category      = gig['category'] as String? ?? '';
    final dueFormatted  = dueIso != null ? _fmtDate(dueIso) : '';

    String dueLabel;
    if (status == 'overdue') { dueLabel = '⚠️ Overdue'; }
    else if (days < 0)       { dueLabel = '⚠️ Overdue'; }
    else if (days == 0)      { dueLabel = '🔴 Due today'; }
    else if (days == 1)      { dueLabel = '🟠 1 day left'; }
    else                     { dueLabel = '$days days left'; }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, border: Border.all(color: badgeColor.withAlpha(80), width: 1.5), borderRadius: BorderRadius.circular(16)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(gig['title'] as String? ?? 'Gig', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _dark)),
            if (category.isNotEmpty || dueFormatted.isNotEmpty)
              Text('${category.isNotEmpty ? category : ''}${category.isNotEmpty && dueFormatted.isNotEmpty ? ' · ' : ''}${dueFormatted.isNotEmpty ? 'Due $dueFormatted' : ''}',
                style: const TextStyle(fontSize: 10, color: _muted)),
          ])),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: badgeColor.withAlpha(26), borderRadius: BorderRadius.circular(20)),
            child: Text(dueLabel, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: badgeColor)),
          ),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          _infoChip('Earned', '${_sym(cur)}${NumberFormat('#,##0.00').format(earned)}', _green),
          const SizedBox(width: 8),
          _infoChip('Commission (${(_kRate * 100).toInt()}%)', '${_sym(cur)}${NumberFormat('#,##0.00').format(amount)}', Colors.red),
          const SizedBox(width: 8),
          _infoChip('In Credits', '$creditsNeeded P', _purple),
        ]),
        const SizedBox(height: 14),
        const Text('Pay with:', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: _muted, letterSpacing: 0.5)),
        const SizedBox(height: 8),
        if (isBusy)
          const Center(child: SizedBox(height: 32, width: 32, child: CircularProgressIndicator(color: _purple, strokeWidth: 2)))
        else Row(children: [
          Expanded(child: _payBtn(
            label: 'Fincra',
            icon: '💳',
            color: const Color(0xFF2563EB),
            onTap: () => _payFincra(c),
          )),
          const SizedBox(width: 6),
          Expanded(child: _payBtn(
            label: '$creditsNeeded Credits',
            icon: '',
            color: _purple,
            enabled: credits >= creditsNeeded,
            onTap: () => _payCredits(c),
          )),
          const SizedBox(width: 6),
          Expanded(child: _payBtn(
            label: '${_sym(cur)} Wallet',
            icon: '',
            color: _green,
            enabled: (_wallets[cur] ?? 0) >= amount,
            onTap: () => _payWallet(c),
          )),
        ]),
      ]),
    );
  }

  Widget _paidCard(Map<String, dynamic> c) {
    final gig    = (c['gigs'] as Map<String, dynamic>?) ?? {};
    final amount = ((c['commission_amount'] as num?) ?? 0).toDouble();
    final cur    = c['currency'] as String? ?? 'USD';
    final method = c['payment_method'] as String? ?? '';
    final paidAt = c['paid_at'] as String? ?? '';

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, border: Border.all(color: _border), borderRadius: BorderRadius.circular(14)),
      child: Row(children: [
        const Icon(Icons.check_circle_rounded, color: _green, size: 20),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(gig['title'] as String? ?? 'Gig', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _dark)),
          Text('${_sym(cur)}${NumberFormat('#,##0.00').format(amount)} · ${method.isEmpty ? 'paid' : method} · ${_fmtDate(paidAt)}', style: const TextStyle(fontSize: 11, color: _muted)),
        ])),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(color: const Color(0xFFDFFDF4), borderRadius: BorderRadius.circular(20)),
          child: const Text('PAID', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: _green)),
        ),
      ]),
    );
  }

  Widget _empty() => Padding(
    padding: const EdgeInsets.only(top: 60),
    child: Column(children: [
      Container(
        width: 80, height: 80,
        decoration: BoxDecoration(color: const Color(0xFFF5F4FF), borderRadius: BorderRadius.circular(20)),
        child: const Center(child: Text('🎉', style: TextStyle(fontSize: 40))),
      ),
      const SizedBox(height: 16),
      const Text('No Commissions!', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: _dark)),
      const SizedBox(height: 8),
      const Text('When you complete gigs, 10% commission\nwill appear here to pay.', textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: _muted, height: 1.5)),
    ]),
  );

  static Widget _balCard({required String label, required String value, required String sub, required Color color, required String icon}) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(color: Colors.white, border: Border.all(color: color.withAlpha(80), width: 1.5), borderRadius: BorderRadius.circular(16)),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      BrandIcon(name: icon, size: 28, active: true),
      const SizedBox(height: 8),
      Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: color)),
      const SizedBox(height: 2),
      Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: _dark)),
      Text(sub, style: const TextStyle(fontSize: 10, color: _muted), overflow: TextOverflow.ellipsis),
    ]),
  );

  static Widget _infoChip(String label, String val, Color color) => Expanded(child: Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
    decoration: BoxDecoration(color: color.withAlpha(15), border: Border.all(color: color.withAlpha(60)), borderRadius: BorderRadius.circular(8)),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(fontSize: 9, color: _muted, fontWeight: FontWeight.w600)),
      Text(val, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color), overflow: TextOverflow.ellipsis),
    ]),
  ));

  static Widget _payBtn({required String label, required String icon, required Color color, required VoidCallback onTap, bool enabled = true}) => GestureDetector(
    onTap: enabled ? onTap : null,
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: enabled ? color : _border,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Center(child: Text(icon.isEmpty ? label : '$icon $label', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: enabled ? Colors.white : _muted), overflow: TextOverflow.ellipsis)),
    ),
  );

  static String _fmtDate(String iso) {
    try {
      final d = parseTs(iso).toLocal();
      const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return '${m[d.month - 1]} ${d.day}';
    } catch (_) { return iso; }
  }
}

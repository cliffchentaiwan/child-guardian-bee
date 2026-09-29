import { fetchSource } from './sources.mjs';

export async function syncSource(db, source, loader = fetchSource) {
  const started = new Date().toISOString();
  const run = crypto.randomUUID();
  await db.prepare('INSERT OR IGNORE INTO sources(id) VALUES (?)').bind(source.id).run();
  const previous = await db.prepare('SELECT * FROM sources WHERE id = ?').bind(source.id).first();
  await db.prepare('INSERT INTO sync_runs(id,source_id,started_at,status) VALUES (?,?,?,?)').bind(run, source.id, started, 'running').run();
  try {
    const { records, period } = await loader(source);
    if (previous.record_count && records.length < previous.record_count * 0.8) throw new Error('suspicious_drop');
    if (previous.source_period && period && Number(period) < Number(previous.source_period)) throw new Error('period_regressed');
    for (let offset = 0; offset < records.length; offset += 50) {
      await db.batch(records.slice(offset, offset + 50).map(r => db.prepare(
        'INSERT INTO organizations(source_id,snapshot_id,source_key,name,search_name,category,city,district,address,period) VALUES (?,?,?,?,?,?,?,?,?,?)'
      ).bind(source.id, run, r.sourceKey, r.name, r.searchName, r.category, r.city, r.district, r.address, r.period)));
    }
    const count = await db.prepare('SELECT count(*) AS n FROM organizations WHERE source_id=? AND snapshot_id=?').bind(source.id, run).first();
    if (count.n !== records.length) throw new Error('incomplete_snapshot');
    const finished = new Date().toISOString();
    // Publish only after every staging batch has succeeded. CAS prevents an older run overwriting a newer publication.
    const publication = await db.batch([
      db.prepare("UPDATE sources SET active_snapshot=?,last_success=?,last_attempt=?,status='ok',record_count=?,source_period=?,error_code=NULL WHERE id=? AND active_snapshot IS ? AND (last_attempt IS NULL OR last_attempt <= ?)")
        .bind(run, finished, started, records.length, period, source.id, previous.active_snapshot, started),
      db.prepare("UPDATE sync_runs SET status='success',finished_at=?,record_count=? WHERE id=? AND EXISTS(SELECT 1 FROM sources WHERE active_snapshot=?)")
        .bind(finished, records.length, run, run),
    ]);
    if (publication[0].meta.changes !== 1) throw new Error('superseded');
    return { source: source.id, status: 'success', count: records.length, period };
  } catch (error) {
    const allowed = new Set(['invalid_schema','invalid_year','invalid_payload','unexpected_city','conflicting_identifier','unexpected_count','source_http_error','source_too_large','suspicious_drop','period_regressed','incomplete_snapshot','superseded']);
    const code = allowed.has(error.message) ? error.message : 'sync_failed';
    await db.batch([
      db.prepare("UPDATE sync_runs SET status='failed',finished_at=?,error_code=? WHERE id=?").bind(new Date().toISOString(), code, run),
      db.prepare("UPDATE sources SET status='failed',last_attempt=?,error_code=? WHERE id=? AND active_snapshot IS ? AND (last_attempt IS NULL OR last_attempt<=?)")
        .bind(started, code, source.id, previous.active_snapshot, started),
      db.prepare('DELETE FROM organizations WHERE source_id=? AND snapshot_id=? AND NOT EXISTS(SELECT 1 FROM sources WHERE active_snapshot=?)').bind(source.id, run, run),
    ]);
    return { source: source.id, status: 'failed', error: code };
  }
}

export async function pruneSnapshots(db) {
  // Keep published versions indefinitely; keep other snapshots/runs for seven days.
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  await db.batch([
    db.prepare('DELETE FROM organizations WHERE snapshot_id IN (SELECT id FROM sync_runs WHERE started_at < ?) AND NOT EXISTS (SELECT 1 FROM sources WHERE active_snapshot=organizations.snapshot_id)').bind(cutoff),
    db.prepare('DELETE FROM sync_runs WHERE started_at < ? AND NOT EXISTS (SELECT 1 FROM sources WHERE active_snapshot=sync_runs.id)').bind(cutoff),
  ]);
}

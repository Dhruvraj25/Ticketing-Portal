import pg from 'pg';
import { performance } from 'perf_hooks';
import http from 'http';
import fs from 'fs';
import path from 'path';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_06TeuIUgVLXM@ep-sweet-river-aqhwknkv-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require',
  max: 5, connectionTimeoutMillis: 30000
});

const FRONTEND = 'http://localhost:3000';
const BACKEND = 'http://localhost:4000';
const REPORTS_DIR = path.join(process.cwd(), '..', 'performance-reports');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, {recursive:true});

function httpGet(url) {
  return new Promise((res, rej) => {
    const start = performance.now();
    http.get(url, {timeout: 20000}, (r) => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res({status: r.statusCode, duration: performance.now()-start, data: d.length}));
    }).on('error', rej).on('timeout', function() { this.destroy(); rej(new Error('timeout')); });
  });
}

async function main() {
  const allData = {
    connections: [], sqlTimings: [], apiTimes: {}, pageTimes: {},
    dbHealth: {}, startedAt: new Date().toISOString()
  };
  let slowQueries = [];
  
  console.log('=== CONNECTION ACQUISITION ===');
  for (let i = 0; i < 3; i++) {
    const s = performance.now();
    const c = await pool.connect();
    const d = performance.now()-s;
    c.release(); allData.connections.push(d);
    console.log('  Conn '+(i+1)+': '+Math.round(d)+'ms');
  }
  const connAvg = allData.connections.reduce((a,b)=>a+b,0)/allData.connections.length;
  console.log('  Avg: '+Math.round(connAvg)+'ms');
  
  console.log('\n=== SQL EXECUTION ===');
  const queries = [
    ['Ping', 'SELECT 1'],
    ['Count users', 'SELECT COUNT(*) FROM "user"'],
    ['Count tickets', 'SELECT COUNT(*) FROM "ticket"'],
    ['Count projects', 'SELECT COUNT(*) FROM "project"'],
    ['Count notifications', 'SELECT COUNT(*) FROM "notification"'],
    ['Recent tickets', 'SELECT id,"ticketNumber",title,status FROM "ticket" ORDER BY "createdAt" DESC LIMIT 10'],
    ['Active projects', 'SELECT id,"projectName",status FROM "project" WHERE status=\'active\' LIMIT 10'],
    ['Unread notifications', 'SELECT id,title,"isRead" FROM "notification" WHERE "isRead"=false ORDER BY "createdAt" DESC LIMIT 10'],
    ['Status distribution', 'SELECT status,COUNT(*) as c FROM "ticket" GROUP BY status ORDER BY c DESC'],
    ['Wallet summary', 'SELECT id,"clientId","remainingHours",status FROM "support_wallet" ORDER BY "remainingHours" ASC LIMIT 10'],
  ];
  const sqlResults = [];
  for (const [name, sql] of queries) {
    const times = [];
    for (let i = 0; i < 2; i++) {
      try {
        const s = performance.now(); const r = await pool.query(sql); const d = performance.now()-s;
        times.push(d); allData.sqlTimings.push({name, ms:d, rows:r.rowCount});
        if (d > 100) slowQueries.push({name, ms:d, rows:r.rowCount});
      } catch(e) { times.push(999); }
    }
    const a = times.reduce((x,y)=>x+y,0)/times.length;
    sqlResults.push({name, avg:Math.round(a*10)/10, max:Math.round(Math.max(...times))});
    console.log('  '+(a<100?'OK':'SLOW')+' '+name+': '+Math.round(a)+'ms');
  }
  const sqlAvg = sqlResults.reduce((s,r)=>s+r.avg,0)/sqlResults.length;
  
  console.log('\n=== API ENDPOINTS ===');
  const apis = [
    ['Health', BACKEND+'/api/health'],
    ['Tickets', BACKEND+'/api/tickets'],
    ['Projects', BACKEND+'/api/projects'],
    ['Notifications', BACKEND+'/api/notifications'],
    ['Reports', BACKEND+'/api/reports'],
    ['Wallets', BACKEND+'/api/wallets'],
  ];
  for (const [name, url] of apis) {
    const times = [];
    for (let i = 0; i < 2; i++) {
      try { const r = await httpGet(url); times.push(r.duration); console.log('  '+name+': '+Math.round(r.duration)+'ms ['+r.status+']'); } catch(e) { times.push(999); }
    }
    allData.apiTimes[name] = {avg: Math.round(times.reduce((a,b)=>a+b,0)/times.length), times};
  }
  
  console.log('\n=== FRONTEND PAGES ===');
  const pages = [
    ['Sign In', '/sign-in'],
    ['Dashboard', '/dashboard'],
    ['Projects', '/dashboard/projects'],
    ['Tickets', '/dashboard/tickets'],
    ['Notifications', '/dashboard/notifications'],
    ['Worklogs', '/dashboard/worklogs'],
    ['Reports', '/dashboard/reports/view'],
    ['Wallets', '/dashboard/wallets'],
    ['Analytics', '/dashboard/analytics'],
    ['Admin Perf', '/dashboard/admin/performance'],
    ['Team', '/dashboard/team'],
    ['Support Wallet', '/dashboard/support-wallet'],
  ];
  for (const [name, route] of pages) {
    const times = [];
    for (let i = 0; i < 2; i++) {
      try { const r = await httpGet(FRONTEND+route); times.push(r.duration); console.log('  '+name.padEnd(16)+' '+Math.round(r.duration)+'ms ['+r.status+']'); } catch(e) { times.push(999); console.log('  '+name+' ERROR'); }
    }
    allData.pageTimes[name] = {avg: times.reduce((a,b)=>a+b,0)/times.length, times};
  }
  
  console.log('\n=== DB HEALTH ===');
  try {
    const idx = await pool.query("SELECT count(*) as cnt FROM pg_indexes WHERE schemaname='public'");
    allData.dbHealth.indexCount = parseInt(idx.rows[0].cnt);
    console.log('  Indexes: '+allData.dbHealth.indexCount);
    
    const sizes = await pool.query("SELECT relname as t, pg_size_pretty(pg_total_relation_size(relid)) as sz FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC");
    allData.dbHealth.tableSizes = sizes.rows;
    for (const r of sizes.rows) console.log('  '+r.t+': '+r.sz);
    
    try {
      const ps = await pool.query("SELECT query, calls, round(mean_exec_time::numeric,1) as avg_ms FROM pg_stat_statements WHERE query NOT LIKE '%pg_%' ORDER BY mean_exec_time DESC LIMIT 10");
      allData.dbHealth.slowestQueries = ps.rows;
      if (ps.rows.length) for (const r of ps.rows) console.log('  '+r.avg_ms+'ms x'+r.calls+' '+r.query.substring(0,60));
    } catch(e) { console.log('  pg_stat_statements not available'); }
  } catch(e) { console.log('  DB health error: '+e.message); }
  
  await pool.end();
  
  // Generate reports
  console.log('\n=== GENERATING REPORTS ===');
  
  // 1. Slow Query
  fs.writeFileSync(path.join(REPORTS_DIR,'01-slow-query-report.json'), JSON.stringify({
    title:'Slow Query Report', generatedAt:new Date().toISOString(),
    total: allData.sqlTimings.length, slowCount: slowQueries.length,
    avgMs: Math.round(sqlAvg*100)/100,
    slowQueries: slowQueries.sort((a,b)=>b.ms-a.ms),
    allSqlTimings: allData.sqlTimings.sort((a,b)=>b.ms-a.ms)
  },null,2));
  
  // 2. Connection
  fs.writeFileSync(path.join(REPORTS_DIR,'02-connection-report.json'), JSON.stringify({
    title:'Connection Report', generatedAt:new Date().toISOString(),
    measurements: allData.connections,
    stats: { avg: Math.round(connAvg*100)/100, min: Math.min(...allData.connections), max: Math.max(...allData.connections) },
    acceptance: connAvg < 20 ? 'PASS' : 'FAIL',
    poolConfig: { max:25, min:2, connectionTimeoutMillis:15000, idleTimeoutMillis:30000 }
  },null,2));
  
  // 3. SQL Timing
  fs.writeFileSync(path.join(REPORTS_DIR,'03-sql-timing-report.json'), JSON.stringify({
    title:'SQL Timing Report', generatedAt:new Date().toISOString(),
    avgAll: Math.round(sqlAvg*100)/100,
    queries: sqlResults.map(r=>({name:r.name, avgMs:r.avg, maxMs:r.max, status:r.avg<100?'PASS':'FAIL'}))
  },null,2));
  
  // 4. API Timing
  fs.writeFileSync(path.join(REPORTS_DIR,'04-api-timing-report.json'), JSON.stringify({
    title:'API Timing Report', generatedAt:new Date().toISOString(),
    endpoints: Object.entries(allData.apiTimes).map(([n,d])=>({name:n, avgMs:Math.round(d.avg*100)/100}))
  },null,2));
  
  // 5. Page Timing
  const pageEntries = Object.entries(allData.pageTimes).map(([n,d])=>({page:n, avgMs:Math.round(d.avg*100)/100, pass:d.avg<1000}));
  fs.writeFileSync(path.join(REPORTS_DIR,'05-page-timing-report.json'), JSON.stringify({
    title:'Page Timing Report', generatedAt:new Date().toISOString(),
    total: pageEntries.length,
    under1s: pageEntries.filter(p

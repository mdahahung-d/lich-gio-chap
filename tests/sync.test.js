/* Kiểm thử đồng bộ nhiều tab (BUG01) và ID trùng khi đọc dữ liệu (BUG02).
   Chạy: node tests/sync.test.js   (từ thư mục Code)
   Mô phỏng hai tab trình duyệt dùng CHUNG một localStorage: mỗi tab là một vm context riêng
   chạy đúng mã Core + Store + State lấy từ index.html. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cut = (a, b) => html.slice(html.indexOf(a), html.indexOf(b));
const code = cut('// ==CORE_START==', '// ==CORE_END==') + cut('// ==STATE_START==', '// ==STATE_END==') +
  '\nthis.Core = Core; this.Store = Store; this.State = State;';

// localStorage dùng chung giữa các "tab"
const mem = new Map();
const sharedStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: k => { mem.delete(k); }
};
function openTab() {
  const ctx = { localStorage: sharedStorage, console, Render: { all() {} }, UI: { toast() {}, today: () => new Date(2026, 10, 19) } };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx.State.load();
  return ctx;
}

let fail = 0;
const eq = (a, b, msg) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log((ok ? 'PASS ' : 'FAIL ') + msg + (ok ? '' : ' -> ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b)));
  if (!ok) fail++;
};
const KEY = 'lichGioChap.v1';

// ---- Kịch bản BUG01 theo báo cáo ----
mem.set(KEY, JSON.stringify([{ id: 'qa1', ten: 'QA KIỂM THỬ 19-11', ngay: 11, thang: 10, ghiChu: 'Bản ghi QA tạm thời', taoLuc: '2026-11-19T00:00:00Z', capNhat: '2026-11-19T00:00:00Z' }]));
const A = openTab(), B = openTab();
eq([A.State.list.length, B.State.list.length], [1, 1], 'Hai tab cùng đọc 1 bản ghi');

// Tab A sửa ghi chú
A.State.mutate(list => list.map(x => x.id === 'qa1' ? { ...x, ghiChu: 'QA ĐÃ SỬA TẠI TAB A', capNhat: '2026-11-19T01:00:00Z' } : x));
// Tab B (chưa tải lại, State.list còn ghi chú cũ) thêm bản ghi mới
eq(B.State.list[0].ghiChu, 'Bản ghi QA tạm thời', 'Tab B đang giữ dữ liệu cũ trong bộ nhớ');
B.State.mutate(list => [...list, { id: 'qa2', ten: 'QA TAB B', ngay: 12, thang: 10, quanHe: '', diaDiem: '', ghiChu: '', taoLuc: '2026-11-19T02:00:00Z', capNhat: '2026-11-19T02:00:00Z' }]);

const stored = JSON.parse(mem.get(KEY));
eq(stored.map(x => x.ten), ['QA KIỂM THỬ 19-11', 'QA TAB B'], 'BUG01: giữ cả bản ghi mới của tab B');
eq(stored[0].ghiChu, 'QA ĐÃ SỬA TẠI TAB A', 'BUG01: KHÔNG mất ghi chú đã lưu ở tab A');
A.State.load();
eq(A.State.list[0].ghiChu, 'QA ĐÃ SỬA TẠI TAB A', 'BUG01: tải lại tab A vẫn thấy thay đổi của A');

// Xóa ở tab A trong khi tab B còn bản cũ, rồi B sửa bản ghi khác → bản đã xóa không "sống lại"
A.State.mutate(list => list.filter(x => x.id !== 'qa2'));
B.State.mutate(list => list.map(x => x.id === 'qa1' ? { ...x, quanHe: 'Ông nội' } : x));
const after = JSON.parse(mem.get(KEY));
eq([after.length, after[0].quanHe, after[0].ghiChu], [1, 'Ông nội', 'QA ĐÃ SỬA TẠI TAB A'], 'BUG01: xóa ở A không bị B ghi đè ngược lại');

// Nhập JSON kéo dài: tab khác lưu trong lúc đang hỏi trùng → không ghi đè
const snap = A.State.raw;
B.State.mutate(list => [...list, { id: 'qa3', ten: 'QA TRONG LÚC NHẬP', ngay: 1, thang: 1, quanHe: '', diaDiem: '', ghiChu: '', taoLuc: '2026-11-19T03:00:00Z', capNhat: '2026-11-19T03:00:00Z' }]);
const r = A.State.commitIfUnchanged(snap, [{ id: 'imp', ten: 'Từ file', ngay: 2, thang: 2 }]);
eq([r, JSON.parse(mem.get(KEY)).map(x => x.id)], ['conflict', ['qa1', 'qa3']], 'BUG01: nhập file bị chặn khi dữ liệu vừa đổi ở tab khác');
const r2 = A.State.commitIfUnchanged(A.State.raw, [...A.State.list, { id: 'imp', ten: 'Từ file', ngay: 2, thang: 2 }]);
eq([r2, JSON.parse(mem.get(KEY)).length], ['ok', 3], 'Nhập file thành công khi dữ liệu không đổi');

// ---- BUG02: dữ liệu cũ trong localStorage có ID trùng ----
mem.set(KEY, JSON.stringify([
  { id: 'dup', ten: 'QA A', ngay: 11, thang: 10 },
  { id: 'dup', ten: 'QA B', ngay: 15, thang: 10 }
]));
const C = openTab();
const ids = C.State.list.map(x => x.id);
eq([C.State.list.length, new Set(ids).size, ids[0]], [2, 2, 'dup'], 'BUG02: đọc dữ liệu cũ ID trùng → tự cấp ID mới, giữ đủ 2 bản ghi');
eq(new Set(JSON.parse(mem.get(KEY)).map(x => x.id)).size, 2, 'BUG02: bản đã sửa ID được ghi lại vào bộ nhớ');
C.State.mutate(list => list.filter(x => x.id !== ids[1]));
eq(JSON.parse(mem.get(KEY)).map(x => x.ten), ['QA A'], 'BUG02: xóa 1 bản ghi không xóa nhầm bản còn lại');
// mutate cũng khử ID trùng nếu thao tác vô tình tạo ra
C.State.mutate(list => [...list, { ...list[0], ten: 'QA C' }]);
eq(new Set(JSON.parse(mem.get(KEY)).map(x => x.id)).size, 2, 'BUG02: ghi danh sách luôn bảo đảm ID duy nhất');

console.log(fail ? `\n${fail} FAIL` : '\nTẤT CẢ PASS');
process.exitCode = fail ? 1 : 0;

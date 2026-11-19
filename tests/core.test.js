/* Kiểm thử lõi (Âm lịch, chuẩn hóa, chống XSS, nhập trùng).
   Chạy: node tests/core.test.js   (từ thư mục Code)
   Lấy phần mã giữa ==CORE_START== và ==CORE_END== trong index.html để kiểm thử đúng mã đang chạy. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const core = html.slice(html.indexOf('// ==CORE_START=='), html.indexOf('// ==CORE_END=='));
vm.runInThisContext(core + '\nglobalThis.Lunar = Lunar; globalThis.Core = Core;');

let fail=0;const eq=(a,b,msg)=>{const ok=JSON.stringify(a)===JSON.stringify(b);console.log((ok?'PASS ':'FAIL ')+msg+(ok?'':' -> '+JSON.stringify(a)+' expected '+JSON.stringify(b)));if(!ok)fail++;};
(async()=>{
// Âm lịch
eq(Lunar.lunarToSolar(1,1,2026,0),[17,2,2026],'Tết 2026');
eq(Lunar.lunarToSolar(1,6,2025,1),[25,7,2025],'1/6 nhuận 2025');
let bad=0;for(let jd=Lunar.jdFromDate(1,1,2020);jd<=Lunar.jdFromDate(31,12,2030);jd++){const [d,m,y]=Lunar.jdToDate(jd);const l=Lunar.solarToLunar(d,m,y);const s=Lunar.lunarToSolar(l.day,l.month,l.year,l.leap);if(!s||s[0]!==d||s[1]!==m||s[2]!==y)bad++;}
eq(bad,0,'Round-trip 2020-2030');
const nx=Core.nextOccurrence(30,12,new Date(2026,10,18)); eq([nx.days,nx.adjusted],[79,true],'Giỗ 30 tháng Chạp thiếu → 29');
// Chuẩn hóa
const old=Core.normalizeItem({id:'a',ten:'  Ông nội  ',ngay:10,thang:10,ghiChu:'x',taoLuc:'2026-01-01T00:00:00Z'});
eq([old.ten,old.quanHe,old.diaDiem],['Ông nội','',''],'Dữ liệu cũ đọc được, trường mới rỗng');
eq(Core.normalizeItem({ten:'A',ngay:31,thang:1}),null,'Từ chối ngày 31');
eq(Core.normalizeItem({ten:'',ngay:1,thang:1}),null,'Từ chối tên rỗng');
eq(Core.normalizeItem({ten:'A',ngay:'1',thang:13}),null,'Từ chối tháng 13');
eq(Core.normalizeItem([1,2]),null,'Từ chối mảng');
const bid=Core.normalizeItem({id:'"><img src=x onerror=alert(1)>',ten:'A',ngay:1,thang:1});
eq(/^[A-Za-z0-9_-]+$/.test(bid.id),true,'ID độc hại bị thay');
eq(Core.normalizeItem({ten:'A\u202Eb\u0000c',ngay:1,thang:1}).ten,'Abc','Bỏ ký tự điều khiển/đảo chiều');
eq(Core.normalizeItem({ten:'A',ngay:1,thang:1,ghiChu:'dòng 1\ndòng 2'}).ghiChu,'dòng 1\ndòng 2','Giữ xuống dòng ghi chú');
// XSS
eq(Core.esc(`<img src=x onerror="a('b')">\``),'&lt;img src&#61;x onerror&#61;&quot;a(&#39;b&#39;)&quot;&gt;&#96;','esc đủ ký tự');
const ft=Core.fillTemplate('Kính <b>{NGUOI_MAT}</b> {DIA_CHI} {LA}',{NGUOI_MAT:'<script>x</script>',DIA_CHI:''});
eq(ft.html,'Kính &lt;b&gt;<span class="vk-fill">&lt;script&gt;x&lt;/script&gt;</span>&lt;/b&gt; <span class="vk-empty">……………</span> {LA}','Mẫu tự sửa + giá trị đều được escape');
eq(ft.missing,1,'Đếm chỗ trống');
// Trùng & gộp
const list=[Core.normalizeItem({id:'a',ten:'Ông Nội',ngay:10,thang:10}),Core.normalizeItem({id:'b',ten:'Bà',ngay:1,thang:2})];
eq(Core.findConflict(list,{id:'zz',ten:'  ông   nội ',ngay:10,thang:10}),{index:0,reason:'ten'},'Trùng tên+ngày (hoa thường, khoảng trắng)');
eq(Core.findConflict(list,{id:'b',ten:'Khác',ngay:5,thang:5}),{index:1,reason:'id'},'Trùng ID');
eq(Core.findConflict(list,{id:'c',ten:'Ông Nội',ngay:11,thang:10}),null,'Khác ngày không trùng');
const inc=[{id:'x1',ten:'ông nội',ngay:10,thang:10,quanHe:'Ông nội'},{id:'b',ten:'Bà mới',ngay:1,thang:2},{id:'n',ten:'Mới',ngay:3,thang:3}].map(Core.normalizeItem);
let asked=0;
let r=await Core.mergeImport(list,inc,async()=>{asked++;return{action:'overwrite',applyAll:false}});
eq([r.list.length,r.stats,asked],[3,{added:1,overwritten:2,skipped:0,copied:0},2],'Ghi đè từng bản ghi');
eq([r.list[0].id,r.list[0].quanHe],['a','Ông nội'],'Ghi đè giữ ID cũ, lấy dữ liệu mới');
eq(list.length,2,'Không sửa danh sách gốc');
asked=0;r=await Core.mergeImport(list,inc,async()=>{asked++;return{action:'skip',applyAll:true}});
eq([r.list.length,r.stats.skipped,asked],[3,2,1],'Bỏ qua + áp dụng tất cả chỉ hỏi 1 lần');
r=await Core.mergeImport(list,inc,async()=>({action:'copy',applyAll:true}));
eq([r.list.length,r.stats.copied,r.list.filter(x=>x.ten.endsWith('(bản sao)')).length],[5,2,2],'Thêm bản sao');
r=await Core.mergeImport(list,inc,async()=>({action:'cancel'}));
eq(r,null,'Hủy nhập trả null');

// ---- Hồi quy theo báo cáo kiểm thử 19/11/2026 ----
// BUG03: ngày âm không được bằng 0
const lu=(d,m,y)=>{const x=Lunar.solarToLunar(d,m,y);return [x.day,x.month,x.year,x.leap];};
eq(lu(7,5,2054),[30,3,2054,0],'BUG03: 07/05/2054 = 30/3 (trước đây mùng 0/4)');
eq(lu(8,5,2054),[1,4,2054,0],'BUG03: 08/05/2054 = mùng 1/4');
eq(lu(9,4,2062),[30,2,2062,0],'BUG03: 09/04/2062 = 30/2 (trước đây mùng 0/3)');
eq(Lunar.lunarToSolar(30,3,2054,0),[7,5,2054],'BUG03: đổi ngược 30/3/2054');
let scan={range:0,seq:0,rt:0},prev=null,days=0;
for(let jd=Lunar.jdFromDate(1,1,1900);jd<=Lunar.jdFromDate(31,12,2100);jd++){days++;
  const [d,m,y]=Lunar.jdToDate(jd);const l=Lunar.solarToLunar(d,m,y);
  if(l.day<1||l.day>30)scan.range++;
  if(prev){const same=l.month===prev.month&&l.leap===prev.leap&&l.year===prev.year;
    if(same?l.day!==prev.day+1:(l.day!==1||(prev.day!==29&&prev.day!==30)))scan.seq++;}
  const s=Lunar.lunarToSolar(l.day,l.month,l.year,l.leap);if(!s||s[0]!==d||s[1]!==m||s[2]!==y)scan.rt++;
  prev=l;}
eq([days,scan],[73414,{range:0,seq:0,rt:0}],'BUG03: quét 1900–2100: ngày 1–30, liên tục, đổi ngược khớp');

// BUG02: ID trùng
const dupFile=[{id:'qa_duplicate',ten:'QA A',ngay:11,thang:10},{id:'qa_duplicate',ten:'QA B',ngay:15,thang:10}];
const pl=Core.parseList(dupFile);
eq([pl.list.length,pl.fixed,pl.list[0].id,pl.list[0].id!==pl.list[1].id],[2,1,'qa_duplicate',true],'BUG02: file 2 bản ghi cùng ID → giữ cả 2, cấp ID mới cho bản sau');
const edited=pl.list.map(x=>x.id===pl.list[1].id?{...x,ten:'QA EDIT'}:x);
eq(edited.map(x=>x.ten),['QA A','QA EDIT'],'BUG02: sửa theo ID chỉ đổi đúng 1 bản ghi');
eq(pl.list.filter(x=>x.id!==pl.list[1].id).map(x=>x.ten),['QA A'],'BUG02: xóa theo ID chỉ xóa đúng 1 bản ghi');
eq(Core.dedupeIds(pl.list).fixed,0,'BUG02: danh sách đã khử không cần sửa thêm');
eq(Core.parseList('khong phai mang'),{list:[],fixed:0,bad:0},'parseList chịu được dữ liệu hỏng');

console.log(fail?`\n${fail} FAIL`:'\nTẤT CẢ PASS');process.exitCode=fail?1:0;
})();

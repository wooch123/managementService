import Database from 'better-sqlite3';
const db = new Database('data/app.db', { readonly: true });
console.log('tech_report:', db.prepare('SELECT far_no, overall_opinion, updated_at FROM tech_report').all());
console.log('samples:', db.prepare('SELECT sample_no, fw_version, uecc_count, sram_test_result, dc_test_result, comment, nand_lot_list FROM tech_report_sample').all().map(r => ({...r, nand_lot_list: String(r.nand_lot_list).slice(0,60)})));

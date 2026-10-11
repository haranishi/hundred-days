//! Search and contextual counts over a compact, validated public-record index.
//! No runtime dependencies and no network, DOM, or person-level information.
#![cfg_attr(not(any(target_arch = "wasm32", test)), allow(dead_code))]
use std::collections::HashSet;
const YEAR_START: u32 = 1900;
const YEAR_COUNT: usize = 201;
const HEADER: usize = 2 + 7 + 5 + YEAR_COUNT + 3 + 4;

#[derive(Clone, Debug)]
struct Record {
    year: u32, unit: u32, cause: u32, status: u32, region: u32, registry: u32, location: u32,
    date: u32, scale: f64, company: u32, search: String,
}
#[derive(Default)]
struct Engine { records: Vec<Record>, output: Vec<u32> }
#[derive(Default, Clone)]
struct Filter { unit: u32, cause: u32, period: u32, status: u32, region: u32, registry: u32, location: u32, order: u32 }
fn read_u32(bytes: &[u8], offset: usize) -> Option<u32> {
    Some(u32::from_le_bytes(bytes.get(offset..offset + 4)?.try_into().ok()?))
}
impl Engine {
    fn load(&mut self, bytes: &[u8]) -> Result<usize, ()> {
        let count = read_u32(bytes, 0).ok_or(())? as usize;
        if count > 1_000_000 || bytes.len() < 4 + count * 28 { return Err(()); }
        let mut records = Vec::with_capacity(count);
        let mut offset = 4;
        for _ in 0..count {
            let head = bytes.get(offset..offset + 28).ok_or(())?;
            let year = u16::from_le_bytes(head[0..2].try_into().map_err(|_| ())?) as u32;
            let unit = head[2] as u32; let cause = head[3] as u32; let status = head[4] as u32;
            let region = head[5] as u32; let registry = head[6] as u32;
            let location = head[7] as u32;
            let date = read_u32(head, 8).ok_or(())?;
            let scale = f64::from_le_bytes(head[12..20].try_into().map_err(|_| ())?);
            let company = read_u32(head, 20).ok_or(())?;
            let length = read_u32(head, 24).ok_or(())? as usize;
            offset += 28;
            let end = offset.checked_add(length).ok_or(())?;
            let search = std::str::from_utf8(bytes.get(offset..end).ok_or(())?).map_err(|_| ())?.to_owned();
            if !(1900..=2100).contains(&year) || !(1..=4).contains(&unit) || !(1..=7).contains(&cause)
                || !(1..=4).contains(&status) || !(1..=2).contains(&region) || !(1..=3).contains(&registry)
                || location > 128 || !scale.is_finite() || (scale < 0.0 && scale != -1.0) { return Err(()); }
            records.push(Record {year, unit, cause, status, region, registry, location, date, scale, company, search});
            offset = end;
        }
        if offset != bytes.len() { return Err(()); }
        self.records = records; self.output.clear(); Ok(count)
    }
    fn query(&mut self, f: &Filter, search: &str) -> Result<(), ()> {
        if f.order == 2 && (f.unit == 0 || f.unit == 4) { return Err(()); }
        let terms: Vec<&str> = search.split('\n').filter(|t| !t.is_empty()).collect();
        let mut counts = vec![0u32; HEADER]; let mut matches = Vec::new(); let mut companies = HashSet::new();
        for (index, record) in self.records.iter().enumerate() {
            if f.location != 0 && f.location != record.location { continue; }
            if !terms.iter().all(|term| record.search.contains(term)) { continue; }
            let unit = f.unit == 0 || f.unit == record.unit;
            let cause = f.cause == 0 || f.cause == record.cause;
            let status = f.status == 0 || f.status == record.status;
            let region = f.region == 0 || f.region == record.region;
            let registry = f.registry == 0 || f.registry == record.registry;
            let period = match f.period { 0 => true, 1 => record.year >= 2025, 2 => record.year < 2025, year => record.year == year };
            if cause && status && region && registry && period { counts[9] += 1; counts[9 + record.unit as usize] += 1; }
            if unit && status && region && registry && period { counts[2 + record.cause as usize - 1] += 1; }
            if unit && cause && status && region && registry { counts[14 + (record.year - YEAR_START) as usize] += 1; }
            if unit && cause && status && registry && period { counts[215] += 1; counts[215 + record.region as usize] += 1; }
            if unit && cause && status && region && period { counts[218] += 1; counts[218 + record.registry as usize] += 1; }
            if unit && cause && status && region && registry && period { matches.push(index as u32); companies.insert(record.company); }
        }
        matches.sort_by(|a, b| {
            let ra = &self.records[*a as usize]; let rb = &self.records[*b as usize];
            let scale = if f.order == 2 { rb.scale.total_cmp(&ra.scale) } else { std::cmp::Ordering::Equal };
            let date = if f.order == 1 { ra.date.cmp(&rb.date) } else { rb.date.cmp(&ra.date) };
            scale.then(date).then(a.cmp(b))
        });
        counts[0] = matches.len() as u32; counts[1] = companies.len() as u32;
        counts.extend(matches); self.output = counts; Ok(())
    }
}

// The browser Worker is single threaded. Inputs are allocated/freed once per call;
// output memory belongs to the engine and remains valid until the next query.
#[cfg(target_arch = "wasm32")]
mod browser {
    use super::*;
    use std::cell::RefCell;
    thread_local! { static ENGINE: RefCell<Engine> = RefCell::new(Engine::default()); }
    #[unsafe(no_mangle)]
    pub extern "C" fn allocate(length: u32) -> *mut u8 {
        Box::into_raw(vec![0u8; length as usize].into_boxed_slice()) as *mut u8
    }
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn release(pointer: *mut u8, length: u32) {
        unsafe { drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(pointer, length as usize))); }
    }
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn load(pointer: *const u8, length: u32) -> u32 {
        let bytes = unsafe { std::slice::from_raw_parts(pointer, length as usize) };
        ENGINE.with(|engine| engine.borrow_mut().load(bytes).map(|n| n as u32).unwrap_or(0))
    }
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn query(unit: u32, cause: u32, period: u32, status: u32, region: u32, registry: u32, location: u32, order: u32, pointer: *const u8, length: u32) -> u32 {
        let bytes = unsafe { std::slice::from_raw_parts(pointer, length as usize) };
        let Ok(search) = std::str::from_utf8(bytes) else {return 0;};
        ENGINE.with(|engine| {
            let mut engine = engine.borrow_mut();
            if engine.query(&Filter {unit,cause,period,status,region,registry,location,order}, search).is_err() {return 0;}
            engine.output.len() as u32
        })
    }
    #[unsafe(no_mangle)]
    pub extern "C" fn result_pointer() -> *const u32 { ENGINE.with(|engine| engine.borrow().output.as_ptr()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn record(year: u32, unit: u32, scale: f64, name: &str) -> Record {
        Record {year,unit,scale,search:name.into(),cause:1,status:2,region:1,registry:1,location:0,date:year*10000+101,company:0}
    }
    #[test]
    fn history_keeps_separate_records_and_units() {
        let mut engine = Engine {records:vec![record(2006,2,186.0,"kddi"),record(2026,2,12231954.0,"kddi"),record(2014,1,28950000.0,"べねっせ")],..Default::default()};
        engine.query(&Filter::default(),"").unwrap();
        assert_eq!(engine.output[0],3); assert_eq!(&engine.output[HEADER..],&[1,2,0]);
        assert_eq!(&engine.output[9..14],&[3,1,2,0,0]);
        engine.query(&Filter::default(),"kddi").unwrap(); assert_eq!(engine.output[0],2);
        assert_eq!(engine.output[1],1);
    }
    #[test]
    fn comparison_requires_one_known_unit() {
        let mut engine=Engine::default();
        assert!(engine.query(&Filter {order:2,..Default::default()},"").is_err());
        assert!(engine.query(&Filter {order:2,unit:4,..Default::default()},"").is_err());
    }
    #[test]
    fn contextual_counts_allow_filter_switches() {
        let mut engine=Engine {records:vec![record(2006,2,186.0,"kddi"),record(2026,2,100.0,"kddi")],..Default::default()};
        engine.query(&Filter {period:2026,..Default::default()},"").unwrap();
        assert_eq!(engine.output[0],1); assert_eq!(engine.output[14+106],1); assert_eq!(engine.output[14+126],1);
    }
    #[test]
    fn invalid_binary_does_not_replace_the_index() {
        let mut engine=Engine::default(); assert!(engine.load(&[1,0,0,0]).is_err());
        assert_eq!(engine.load(&[0,0,0,0]),Ok(0));
        assert!(engine.load(&[0,0,0,0,1]).is_err());
    }
    #[test]
    fn reported_notifications_remain_distinct() {
        let mut notification=record(2026,4,-1.0,"notification"); notification.status=3;notification.region=2;notification.registry=2;
        let mut engine=Engine {records:vec![notification,record(2026,2,100.0,"confirmed")],..Default::default()};
        engine.query(&Filter {status:3,region:2,..Default::default()},"").unwrap();assert_eq!(engine.output[0],1);
        engine.query(&Filter {status:1,..Default::default()},"").unwrap();assert_eq!(engine.output[0],0);
    }
    #[test]
    fn geographic_filter_scopes_records_and_all_contextual_counts() {
        let mut tokyo = record(2026,4,-1.0,"tokyo"); tokyo.location=1;
        let mut country = record(2014,2,10.0,"country"); country.location=2;
        let mut engine=Engine {records:vec![tokyo,country],..Default::default()};
        engine.query(&Filter {location:1,..Default::default()},"").unwrap();
        assert_eq!(engine.output[0],1); assert_eq!(&engine.output[HEADER..],&[0]);
        assert_eq!(engine.output[9],1); assert_eq!(engine.output[2],1);
        assert_eq!(engine.output[14+114],0); assert_eq!(engine.output[14+126],1);
        engine.query(&Filter::default(),"").unwrap();assert_eq!(engine.output[0],2);
    }
    #[test]
    fn public_notice_status_loads_and_filters_without_becoming_a_confirmation() {
        let mut bytes = 1_u32.to_le_bytes().to_vec();
        bytes.extend_from_slice(&2026_u16.to_le_bytes());
        bytes.extend_from_slice(&[4,1,4,1,1,0]);
        bytes.extend_from_slice(&20261001_u32.to_le_bytes());
        bytes.extend_from_slice(&(-1.0_f64).to_le_bytes());
        bytes.extend_from_slice(&0_u32.to_le_bytes());
        bytes.extend_from_slice(&0_u32.to_le_bytes());
        let mut engine = Engine::default();
        assert_eq!(engine.load(&bytes), Ok(1));
        engine.query(&Filter {status:4,..Default::default()},"").unwrap();
        assert_eq!(engine.output[0],1);
        engine.query(&Filter {status:1,..Default::default()},"").unwrap();
        assert_eq!(engine.output[0],0);
        bytes[8] = 5;
        assert!(engine.load(&bytes).is_err());
        assert_eq!(engine.records.len(),1);
        bytes[8] = 4; bytes[11] = 255;
        assert!(engine.load(&bytes).is_err());
        assert_eq!(engine.records.len(),1);
    }
}

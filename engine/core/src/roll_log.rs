use crate::view::RollRecord;

#[derive(Debug, Default, Clone)]
pub struct RollLog {
    records: Vec<RollRecord>,
}

impl RollLog {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn into_vec(self) -> Vec<RollRecord> {
        self.records
    }

    pub fn push(&mut self, record: RollRecord) {
        self.records.push(record);
    }

    pub fn len(&self) -> usize {
        self.records.len()
    }
}

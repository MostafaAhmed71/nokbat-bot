function todayIsoRiyadh() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
}

module.exports = { todayIsoRiyadh };

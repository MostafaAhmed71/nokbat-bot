/** Mirrors web logic: explicit display_order first (positive), unset last; then newest uploaded_at */

const UNSET_ORDER = 1_000_000;

function rowOrder(m) {
  const o = Number(m.display_order);
  if (!Number.isFinite(o) || o <= 0) return UNSET_ORDER;
  return o;
}

/** @param {object[]} rows */
function sortUploadedMaterials(rows) {
  return [...rows].sort((a, b) => {
    const av = rowOrder(a);
    const bv = rowOrder(b);
    if (av !== bv) return av - bv;
    const at = a.uploaded_at ? new Date(a.uploaded_at).getTime() : 0;
    const bt = b.uploaded_at ? new Date(b.uploaded_at).getTime() : 0;
    return bt - at;
  });
}

/** Group by subject_name, materials sorted inside each group; groups sorted by ar name */
function groupMaterialsBySubject(rows) {
  const sorted = sortUploadedMaterials(rows);
  const map = new Map();
  for (const r of sorted) {
    const key = String(r.subject_name || 'عام').trim() || 'عام';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return [...map.entries()].sort((a, b) =>
    String(a[0]).localeCompare(String(b[0]), 'ar')
  );
}

module.exports = {
  sortUploadedMaterials,
  groupMaterialsBySubject,
};

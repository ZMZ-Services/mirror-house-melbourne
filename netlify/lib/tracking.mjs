// Classifying a visit: where it came from and what kind of device.
export function sourceOf(ref, utm, host) {
  const u = String(utm || '').toLowerCase();
  if (u) {
    if (/mail|newsletter|resend/.test(u)) return 'Email';
    if (/insta/.test(u)) return 'Instagram';
    if (/face|fb/.test(u)) return 'Facebook';
    if (/pin/.test(u)) return 'Pinterest';
    if (/google/.test(u)) return 'Google search';
  }
  let h = '';
  try { h = ref ? new URL(ref).hostname.toLowerCase() : ''; } catch { h = ''; }
  if (!h || (host && h === String(host).toLowerCase())) return 'Direct';
  if (/(^|\.)google\./.test(h)) return 'Google search';
  if (/bing\.|duckduckgo\.|yahoo\.|ecosia\./.test(h)) return 'Other search';
  if (/instagram\./.test(h)) return 'Instagram';
  if (/facebook\.|fb\.|messenger\./.test(h)) return 'Facebook';
  if (/pinterest\./.test(h)) return 'Pinterest';
  if (/mail\.|outlook\./.test(h)) return 'Email';
  return 'Referral sites';
}
export function deviceOf(ua) {
  const s = String(ua || '');
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(s)) return 'Tablet';
  if (/Mobi|iPhone|Android/i.test(s)) return 'Mobile';
  return 'Desktop';
}

// One X search per competitor. The key is stored as the tweet's search_bucket,
// so never rename an existing key: it holds the since_id for that search.
//
// Searches are broad on purpose: complaints mostly arrive as replies in threads and
// rarely use a predictable keyword, so the classifier decides what counts, not the query.
const COMPETITORS = {
  billcom: {
    name: 'Bill.com',
    description: 'the AP, bill pay and invoicing platform',
    search: '("bill.com" OR @billcom OR billcom OR "bill dot com")',
    notes: '',
    minFit: 'low',
  },
  quickbooks: {
    name: 'QuickBooks',
    description: "Intuit's accounting software, including QuickBooks Bill Pay, Payments, Payroll and bank feeds",
    // "qbo" alone matches a weather index (quasi-biennial oscillation), so it is left out
    search: '(quickbooks OR @QuickBooks OR @QBCares)',
    notes: [
      '   - Count problems with paying bills, vendors or contractors, ACH, payroll, payments, bank feeds, support, pricing, or leaving QuickBooks',
      '   - Not complaints: bookkeepers or software companies marketing cleanup, migration or a QuickBooks replacement, accountants debating the industry, AI agent demos, job ads, and Intuit stock talk',
    ].join('\n'),
    // QuickBooks is ~60x Bill.com's volume, so only alert on authors who could buy
    minFit: 'medium',
  },
};

export default COMPETITORS;

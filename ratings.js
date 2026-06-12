// Team-strength Elo ratings for WC2026 Monte Carlo simulation.
// Source: eloratings.net (World Football Elo Ratings), as of 11 Jun 2026.
// Keys use POOL spellings (must match Engine.TEAM_GROUP exactly).
(function (root, factory) {
  if (typeof module !== 'undefined') module.exports = factory();
  else root.RATINGS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    // Group A
    'Czech Rep.': 1712,
    'Mexico': 1881,
    'South Korea': 1786,
    'South Africa': 1511,
    // Group B
    'Qatar': 1421,
    'Switzerland': 1891,
    'Canada': 1788,
    'Bosnia & Herz.': 1595,
    // Group C
    'Brazil': 1991,
    'Morocco': 1827,
    'Scotland': 1782,
    'Haiti': 1548,
    // Group D
    'Turkey': 1911,
    'Paraguay': 1834,
    'Australia': 1777,
    'United States': 1726,
    // Group E
    'Germany': 1932,
    'Ecuador': 1938,
    'Ivory Coast': 1695,
    'Curacao': 1434,
    // Group F
    'Netherlands': 1948,
    'Sweden': 1712,
    'Japan': 1906,
    'Tunisia': 1628,
    // Group G
    'Belgium': 1894,
    'Iran': 1772,
    'Egypt': 1696,
    'New Zealand': 1562,
    // Group H
    'Spain': 2157,
    'Uruguay': 1892,
    'Saudi Arabia': 1576,
    'Cape Verde': 1578,
    // Group I
    'France': 2063,
    'Senegal': 1860,
    'Norway': 1914,
    'Iraq': 1607,
    // Group J
    'Argentina': 2115,
    'Austria': 1830,
    'Jordan': 1680,
    'Algeria': 1772,
    // Group K
    'Portugal': 1989,
    'Colombia': 1982,
    'DR Congo': 1652,
    'Uzbekistan': 1714,
    // Group L
    'England': 2024,
    'Croatia': 1912,
    'Ghana': 1510,
    'Panama': 1730,
  };
});

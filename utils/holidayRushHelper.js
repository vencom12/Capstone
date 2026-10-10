/**
 * Holiday & Rush Season Helper for Lucena City & Philippines
 * Identifies whether an order was placed or finished during peak seasons,
 * local Lucena City festivities, or national holidays.
 */

/**
 * Detects if a given date falls within a recognized Philippine or Lucena City rush season.
 * @param {Date|string} dateInput - Order creation date or completion date
 * @param {boolean} [isRushFlag=false] - Whether order was explicitly flagged as rush
 * @returns {{ isRushSeason: boolean, seasonName: string, title: string, description: string, tag: string }}
 */
function detectRushSeason(dateInput, isRushFlag = false) {
  const d = dateInput ? new Date(dateInput) : new Date();
  const month = d.getMonth() + 1; // 1 - 12
  const day = d.getDate();

  // 1. Explicit Customer / Cashier Rush Order Flag
  if (isRushFlag) {
    return {
      isRushSeason: true,
      seasonName: 'Expedited Priority Order',
      title: '⚡ Expedited Priority Machine Order',
      description: 'This order was flagged for priority turnaround. Our multi-needle machines operated on expedited scheduling to craft your custom embroidery ahead of standard queues.',
      tag: 'PRIORITY_RUSH'
    };
  }

  // 2. December - January Holiday Season (Christmas & Year-End Peak)
  if (month === 12 || (month === 1 && day <= 5)) {
    return {
      isRushSeason: true,
      seasonName: 'Christmas & Year-End Peak Rush',
      title: '🎄 Holiday Peak Season Order (Christmas & New Year)',
      description: 'This order was processed during the peak holiday gift season in Lucena City. Thank you for your patience as our embroidery artisans dedicated extended machine shifts to your personalized items.',
      tag: 'CHRISTMAS_RUSH'
    };
  }

  // 3. Lucena City Charter Day & Quezon Day (August 19 - 20)
  // August 19: Manuel L. Quezon Day (Quezon Province Holiday)
  // August 20: Araw ng Lungsod ng Lucena (Lucena Charter Day - Special Non-Working Holiday in Lucena City)
  if (month === 8 && day >= 15 && day <= 22) {
    return {
      isRushSeason: true,
      seasonName: 'Lucena City Charter Day & Quezon Festival Season',
      title: '🎉 Lucena City Charter Day & Quezon Day Season',
      description: 'Placed during the Araw ng Lucena & Quezon Province festival season (Aug 19–20). Our Pacific Mall workshop experienced high commemorative embroidery volume during this citywide holiday.',
      tag: 'LUCENA_CHARTER_DAY'
    };
  }

  // 4. May Fiesta & Pahiyas Festival Season (May 10 - 22)
  if (month === 5 && day >= 10 && day <= 22) {
    return {
      isRushSeason: true,
      seasonName: 'Pahiyas & May Harvest Festival Season',
      title: '🌾 May Fiesta & Pahiyas Festival Season',
      description: 'Processed during Quezon Province\'s celebrated Pahiyas & May festival rush. Extra artisan care was taken to meet festive regional demand.',
      tag: 'PAHIYAS_SEASON'
    };
  }

  // 5. Graduation & Summer Batch Season (March 25 - April 30)
  if ((month === 3 && day >= 20) || month === 4) {
    return {
      isRushSeason: true,
      seasonName: 'Graduation & Holy Week Season',
      title: '🎓 Academic Graduation & Summer Rush Season',
      description: 'Logged during Lucena graduation and batch custom embroidery rush. Personalized stoles, uniform monograms, and gift orders received priority workshop queueing.',
      tag: 'GRADUATION_RUSH'
    };
  }

  // 6. All Saints / Undas Long Weekend (October 28 - November 4)
  if ((month === 10 && day >= 28) || (month === 11 && day <= 4)) {
    return {
      isRushSeason: true,
      seasonName: 'Undas Holiday Long Weekend',
      title: '🕯️ Undas Holiday Season Schedule',
      description: 'Processed during the nationwide All Saints & Souls Day holiday schedule in Quezon Province.',
      tag: 'UNDAS_HOLIDAY'
    };
  }

  // 7. Philippine Independence Day Season (June 10 - 15)
  if (month === 6 && day >= 10 && day <= 15) {
    return {
      isRushSeason: true,
      seasonName: 'Philippine Independence Day Season',
      title: '🇵🇭 Philippine Independence Day Holiday',
      description: 'Handled during the June 12 National Independence Day holiday window.',
      tag: 'INDEPENDENCE_DAY'
    };
  }

  // Standard Non-Rush Period
  return {
    isRushSeason: false,
    seasonName: 'Regular Production Schedule',
    title: 'Standard Workshop Schedule',
    description: 'Crafted under standard production timeline at our Pacific Mall Lucena studio.',
    tag: 'REGULAR'
  };
}

module.exports = {
  detectRushSeason
};

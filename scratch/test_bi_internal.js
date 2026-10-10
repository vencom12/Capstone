const { getActiveSuggestions } = require('../controllers/postgres/forecastingController');
const prisma = require('../utils/prisma');

async function testBiEngine() {
    console.log('--- Testing Phase 3: Predictive Analytics & Suggestion Engine ---');
    try {
        const result = await getActiveSuggestions(true);

        if (result && result.metrics && result.projections) {
            console.log('\n✅ BI Analytics Engine successfully executed!');
            console.log(`- Historical Summary (365d):`);
            console.log(`  - Total Visits: ${result.metrics.totalVisits}`);
            console.log(`  - Avg Order Value: ₱${result.metrics.avgOrderValue.toFixed(2)}`);
            console.log(`  - Conversion Rate: ${(result.metrics.conversionRate * 100).toFixed(2)}%`);
            
            console.log(`\n- Linear Regression Projections (Next 7 days):`);
            console.log(`  - Projected Visits:`, result.projections.forecast.visits.map(v => Math.round(v)));
            console.log(`  - Projected Orders:`, result.projections.forecast.orders.map(o => Math.round(o)));
            console.log(`  - Projected Revenue:`, result.projections.forecast.revenue.map(r => '₱' + Math.round(r)));

            console.log(`\n- Active Suggestions Generated: ${result.suggestions?.length || 0}`);
            if (result.suggestions && result.suggestions.length > 0) {
                console.log('\nSample Actionable Suggestions:');
                result.suggestions.slice(0, 3).forEach((s, idx) => {
                    console.log(`  ${idx + 1}. [${s.category}] ${s.title}`);
                    console.log(`     Severity: ${s.severity}`);
                    console.log(`     Action: ${s.actionText || 'N/A'}`);
                    if (s.action) {
                        console.log(`     Action Payload:`, JSON.stringify(s.action));
                    }
                });
            }
        } else {
            console.log('BI returned:', result);
        }
    } catch (err) {
        console.error('BI Test Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

testBiEngine();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { randomUUID } = require('crypto');

// Get all Maintenance Incident Tickets, Real Machines & Dynamic Shop Profile
exports.getTickets = async (req, res) => {
    try {
        const [tickets, machines, settings] = await Promise.all([
            prisma.$queryRaw`
                SELECT * FROM "MaintenanceTicket" 
                ORDER BY 
                    CASE WHEN "status" = 'Open' THEN 1 
                         WHEN "status" = 'In_Progress' THEN 2 
                         ELSE 3 
                    END,
                    "createdAt" DESC
            `,
            prisma.machine.findMany({
                orderBy: { name: 'asc' },
                select: { id: true, name: true, type: true, status: true }
            }),
            prisma.systemSettings.findFirst({
                select: {
                    businessName: true,
                    businessContact: true,
                    businessEmail: true,
                    businessAddress: true
                }
            })
        ]);

        const openCount = tickets.filter(t => t.status === 'Open').length;
        const inProgressCount = tickets.filter(t => t.status === 'In_Progress').length;
        const resolvedCount = tickets.filter(t => t.status === 'Resolved').length;

        res.json({
            success: true,
            tickets,
            machines,
            settings: settings || {
                businessName: 'Stitch-Opt Workshop',
                businessContact: 'Direct Management',
                businessEmail: 'support@stitch-opt.com',
                businessAddress: 'Workshop Studio'
            },
            metrics: {
                totalCount: tickets.length,
                openCount,
                inProgressCount,
                resolvedCount
            }
        });
    } catch (err) {
        console.error('Error fetching maintenance tickets:', err);
        res.status(500).json({ message: 'Failed to retrieve maintenance data' });
    }
};

// Create a new Machine Incident / Breakdown Ticket
exports.createTicket = async (req, res) => {
    try {
        const { machineId, issueType, severity, description } = req.body;

        if (!machineId) {
            return res.status(400).json({ message: 'Please select an equipment machine' });
        }
        if (!description || !description.trim()) {
            return res.status(400).json({ message: 'Please describe the breakdown or issue symptoms' });
        }

        const machine = await prisma.machine.findUnique({
            where: { id: machineId }
        });

        if (!machine) {
            return res.status(404).json({ message: 'Machine not found in database registry' });
        }

        const cleanType = issueType?.trim() || 'Mechanical Jam';
        const cleanSeverity = severity?.trim() || 'Warning';
        const cleanDesc = description.trim();
        const reportedBy = req.user?.username || 'Staff Operator';
        const reportedById = req.user?.id || null;
        const id = randomUUID();

        // If Critical severity, automatically mark the real machine as Maintenance
        if (cleanSeverity === 'Critical') {
            await prisma.machine.update({
                where: { id: machineId },
                data: { status: 'Maintenance' }
            });
        }

        await prisma.$executeRaw`
            INSERT INTO "MaintenanceTicket" (
                "id", "machineId", "machineName", "issueType", "severity",
                "description", "status", "reportedBy", "reportedById",
                "createdAt", "updatedAt"
            ) VALUES (
                ${id}, ${machineId}, ${machine.name}, ${cleanType}, ${cleanSeverity},
                ${cleanDesc}, 'Open', ${reportedBy}, ${reportedById},
                NOW(), NOW()
            )
        `;

        const [created] = await prisma.$queryRaw`
            SELECT * FROM "MaintenanceTicket" WHERE "id" = ${id}
        `;

        res.status(201).json({
            success: true,
            message: `Maintenance ticket filed for ${machine.name}. ${cleanSeverity === 'Critical' ? 'Machine status set to Maintenance.' : ''}`,
            ticket: created
        });
    } catch (err) {
        console.error('Error creating maintenance ticket:', err);
        res.status(500).json({ message: 'Failed to record maintenance ticket' });
    }
};

// Update Maintenance Ticket Status (Resolve / In Progress)
exports.updateTicket = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, resolutionNotes, resetMachineStatus } = req.body;

        const [ticket] = await prisma.$queryRaw`
            SELECT * FROM "MaintenanceTicket" WHERE "id" = ${id}
        `;

        if (!ticket) {
            return res.status(404).json({ message: 'Maintenance ticket not found' });
        }

        const validStatuses = ['Open', 'In_Progress', 'Resolved'];
        const newStatus = (status && validStatuses.includes(status)) ? status : ticket.status;
        const newNotes = resolutionNotes !== undefined ? resolutionNotes.trim() : ticket.resolutionNotes;
        const isResolving = newStatus === 'Resolved';

        await prisma.$executeRaw`
            UPDATE "MaintenanceTicket"
            SET 
                "status" = ${newStatus},
                "resolutionNotes" = ${newNotes},
                "resolvedAt" = ${isResolving ? new Date() : ticket.resolvedAt},
                "updatedAt" = NOW()
            WHERE "id" = ${id}
        `;

        // If ticket is resolved and reset requested, return machine to Idle if no other critical tickets open
        if (isResolving && resetMachineStatus) {
            const otherOpenCritical = await prisma.$queryRaw`
                SELECT id FROM "MaintenanceTicket"
                WHERE "machineId" = ${ticket.machineId}
                  AND "status" = 'Open'
                  AND "severity" = 'Critical'
                  AND "id" != ${id}
            `;

            if (otherOpenCritical.length === 0) {
                await prisma.machine.update({
                    where: { id: ticket.machineId },
                    data: { status: 'Idle' }
                });
            }
        }

        const [updated] = await prisma.$queryRaw`
            SELECT * FROM "MaintenanceTicket" WHERE "id" = ${id}
        `;

        res.json({
            success: true,
            message: `Ticket updated to ${newStatus}`,
            ticket: updated
        });
    } catch (err) {
        console.error('Error updating maintenance ticket:', err);
        res.status(500).json({ message: 'Failed to update maintenance ticket' });
    }
};

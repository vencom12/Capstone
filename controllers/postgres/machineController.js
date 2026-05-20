const prisma = require('../../utils/prisma');
const socketUtil = require('../../utils/socketUtil');
const { ACTIONS, ENTITIES } = require('../../utils/apiConstants');

const machineInclude = {
  assignedUser: {
    select: { id: true, username: true, shiftStatus: true }
  }
};

exports.getMachines = async (req, res) => {
  try {
    const machines = await prisma.machine.findMany({
      include: machineInclude,
      orderBy: { createdAt: 'asc' }
    });
    res.json(machines);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching machines' });
  }
};

exports.createMachine = async (req, res) => {
  try {
    const { name, type } = req.body;
    const machine = await prisma.machine.create({
      data: { name, type },
      include: machineInclude
    });

    // Audit log
    await prisma.globalAuditLog.create({
      data: {
        action: 'CREATE',
        entity: 'Machine',
        entityId: machine.id,
        userId: req.user ? req.user.id : null,
        userRole: req.user ? req.user.role : null,
        diff: { new: machine }
      }
    });

    // Real-time socket broadcast
    const io = req.app.get('io');
    if (io) {
      socketUtil.emitDataChanged(io, ACTIONS.CREATE, ENTITIES.MACHINE, machine);
    }

    res.status(201).json(machine);
  } catch (error) {
    console.error(error);
    if (error.code === 'P2002') return res.status(400).json({ error: 'Machine name must be unique' });
    res.status(500).json({ error: 'Server error creating machine' });
  }
};

exports.updateMachine = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, status, assignedUserId } = req.body;

    // Build update data carefully — only include fields that were sent
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (status !== undefined) updateData.status = status;
    if (assignedUserId !== undefined) updateData.assignedUserId = assignedUserId || null;

    const machine = await prisma.machine.update({
      where: { id },
      data: updateData,
      include: machineInclude
    });

    // Real-time socket broadcast
    const io = req.app.get('io');
    if (io) {
      socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.MACHINE, machine);
    }

    res.json(machine);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error updating machine' });
  }
};

exports.deleteMachine = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.machine.delete({ where: { id } });

    // Audit log
    await prisma.globalAuditLog.create({
      data: {
        action: 'DELETE',
        entity: 'Machine',
        entityId: id,
        userId: req.user ? req.user.id : null,
        userRole: req.user ? req.user.role : null
      }
    });

    // Real-time socket broadcast
    const io = req.app.get('io');
    if (io) {
      socketUtil.emitDataChanged(io, ACTIONS.DELETE, ENTITIES.MACHINE, { id });
    }

    res.json({ message: 'Machine deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error deleting machine' });
  }
};

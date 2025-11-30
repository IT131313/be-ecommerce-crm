const express = require('express');
const router = express.Router();
const db = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const { authMiddleware, adminAuthMiddleware, userOnlyMiddleware } = require('../middleware/auth');

const consultationUploadsDir = path.join(__dirname, '..', 'uploads', 'consultations');
fs.mkdirSync(consultationUploadsDir, { recursive: true });

const contractUploadsDir = path.join(__dirname, '..', 'uploads', 'contracts');
fs.mkdirSync(contractUploadsDir, { recursive: true });

const consultationStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, consultationUploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'consultation-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const consultationUpload = multer({
  storage: consultationStorage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const toConsultationImagePath = (filename) => path.posix.join('uploads/consultations', filename);
const OPTIONAL_DESIGN_SERVICE_IDS = new Set([1, 3]);
const TIMELINE_STATUSES = new Set(['pending', 'in_progress', 'completed', 'cancel']);
const TIMELINE_ACTIVITY_TYPES = new Set(['progress', 'meeting', 'finalization']);
const PAYMENT_STATUSES = new Set([
  'not_ready',
  'not_ready_final',
  'dp_paid',
  'awaiting_cancellation_fee',
  'cancellation_fee_recorded',
  'awaiting_final_payment',
  'paid',
  'overdue'
]);
const DELIVERY_STATUSES = new Set(['not_ready', 'withheld', 'delivered']);

const contractStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, contractUploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'contract-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const contractUpload = multer({
  storage: contractStorage,
  limits: {
    fileSize: 15 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (file.mimetype === 'application/pdf' || ext === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

const timelineResultUploadsDir = path.join(__dirname, '..', 'uploads', 'timeline-results');
fs.mkdirSync(timelineResultUploadsDir, { recursive: true });

const timelineResultStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, timelineResultUploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'timeline-result-' + uniqueSuffix + path.extname(file.originalname || ''));
  }
});

const timelineResultUpload = multer({
  storage: timelineResultStorage,
  limits: {
    fileSize: 25 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (!file || !file.mimetype) {
      return cb(new Error('Invalid file'));
    }
    if (file.mimetype.startsWith('image/')) {
      return cb(null, true);
    }
    const allowedTypes = new Set([
      'application/pdf',
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream'
    ]);
    if (allowedTypes.has(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error('File format tidak didukung untuk hasil progress/finalisasi'));
  }
});

const handleTimelineResultUpload = (req, res, next) => {
  timelineResultUpload.single('resultFile')(req, res, (err) => {
    if (err) {
      console.error('Timeline result upload error:', err);
      return res.status(400).json({ error: err.message || 'Gagal mengunggah file hasil progress/finalisasi' });
    }
    next();
  });
};

const DEFAULT_TIMELINE_TEMPLATE = [
  {
    title: 'Kick-off & Scope Confirmation',
    description: 'Review the signed contract with {clientName}, confirm deliverables, and align expectations.',
    offsetDays: 0,
    activityType: 'progress'
  },
  {
    title: 'Concept Development',
    description: 'Produce initial design concepts based on the consultation brief and share with {clientName} for review.',
    offsetDays: 7,
    activityType: 'progress'
  },
  {
    title: 'Client Review & Revisions',
    description: 'Collect feedback from {clientName}, prioritize requested changes, and iterate on the concept.',
    offsetDays: 14,
    activityType: 'progress'
  },
  {
    title: 'Finalization & Handover',
    description: 'Finalize all deliverables, prepare documentation, and hand over the approved assets to {clientName}.',
    offsetDays: 21,
    activityType: 'finalization'
  }
];

const toContractPath = (filename) => path.posix.join('uploads/contracts', filename);
const toTimelineResultPath = (filename) => path.posix.join('uploads/timeline-results', filename);

async function deleteContractFile(relativePath) {
  if (!relativePath) {
    return;
  }
  const uploadsRoot = path.normalize(contractUploadsDir);
  const absolutePath = path.normalize(path.join(__dirname, '..', relativePath));
  if (!absolutePath.startsWith(uploadsRoot)) {
    return;
  }
  try {
    await fsPromises.unlink(absolutePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Failed to delete consultation contract file:', error);
    }
  }
}

async function deleteTimelineResultFile(relativePath) {
  if (!relativePath) {
    return;
  }
  const uploadsRoot = path.normalize(timelineResultUploadsDir);
  const absolutePath = path.normalize(path.join(__dirname, '..', relativePath));
  if (!absolutePath.startsWith(uploadsRoot)) {
    return;
  }
  try {
    await fsPromises.unlink(absolutePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Failed to delete consultation timeline result file:', error);
    }
  }
}

function normalizeDateString(rawValue) {
  if (!rawValue) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return rawValue;
  }
  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
}

function computeDueDate(baseDateString, offsetDays) {
  if (!baseDateString || typeof offsetDays !== 'number' || Number.isNaN(offsetDays)) {
    return null;
  }
  const baseDate = new Date(baseDateString);
  if (Number.isNaN(baseDate.getTime())) {
    return null;
  }
  baseDate.setDate(baseDate.getDate() + offsetDays);
  return baseDate.toISOString().slice(0, 10);
}

function normalizeDateTimeString(rawValue) {
  if (!rawValue) {
    return null;
  }
  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

function substituteClientName(text, clientName) {
  if (!text) {
    return text;
  }
  return text.replace(/{clientName}/g, clientName || 'client');
}

async function deleteConsultationImages(relativePaths) {
  if (!Array.isArray(relativePaths) || relativePaths.length === 0) {
    return;
  }

  const uploadsRoot = path.normalize(consultationUploadsDir);

  for (const relativePath of relativePaths) {
    if (!relativePath) {
      continue;
    }

    const absolutePath = path.normalize(path.join(__dirname, '..', relativePath));
    if (!absolutePath.startsWith(uploadsRoot)) {
      continue;
    }

    try {
      await fsPromises.unlink(absolutePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Failed to delete consultation reference image:', error);
      }
    }
  }
}

async function updateConsultationStatusIfAllowed(consultationId, nextStatus) {
  if (!nextStatus) {
    return;
  }
  await db.run(
    `UPDATE consultations
     SET status = CASE 
       WHEN status IN ('cancelled', 'finalized') THEN status
       ELSE ?
     END
     WHERE id = ?`,
    [nextStatus, consultationId]
  );
}

async function syncContractPaymentStage(contractId) {
  if (!contractId) {
    return;
  }

  const stats = await db.get(
    `
    SELECT 
      c.id AS consultation_id,
      c.status,
      c.payment_status,
      COUNT(ti.id) AS total_items,
      SUM(CASE WHEN ti.status = 'completed' THEN 1 ELSE 0 END) AS completed_items,
      SUM(CASE WHEN ti.activity_type <> 'finalization' THEN 1 ELSE 0 END) AS non_final_items,
      SUM(CASE WHEN ti.activity_type <> 'finalization' AND ti.status = 'completed' THEN 1 ELSE 0 END) AS completed_non_final
    FROM consultation_contracts cc
    JOIN consultations c ON c.id = cc.consultation_id
    LEFT JOIN consultation_timeline_items ti ON ti.contract_id = cc.id
    WHERE cc.id = ?
    GROUP BY c.id, c.status, c.payment_status
    `,
    [contractId]
  );

  if (!stats || stats.total_items === 0) {
    return;
  }

  if (stats.non_final_items > 0 && stats.completed_non_final === stats.non_final_items) {
    await db.run(
      `
      UPDATE consultations
      SET 
        status = CASE 
          WHEN status IN ('cancelled', 'finalized') THEN status
          ELSE 'awaiting_payment'
        END,
        payment_status = CASE
          WHEN payment_status = 'awaiting_cancellation_fee' THEN payment_status
          WHEN payment_status = 'paid' THEN payment_status
          ELSE 'awaiting_final_payment'
        END,
        final_delivery_status = CASE
          WHEN final_delivery_status = 'not_ready' THEN 'withheld'
          ELSE final_delivery_status
        END
      WHERE id = ?
      `,
      [stats.consultation_id]
    );
  }
}

async function loadTimelineItemAccess(consultationId, contractId, timelineItemId) {
  if (!consultationId || !contractId || !timelineItemId) {
    return null;
  }

  return db.get(
    `
    SELECT 
      ti.id,
      ti.contract_id,
      ti.title,
      ti.activity_type,
      ti.status AS timeline_status,
      ti.result_file_path,
      c.user_id,
      c.payment_status
    FROM consultation_timeline_items ti
    JOIN consultation_contracts cc ON ti.contract_id = cc.id
    JOIN consultations c ON c.id = cc.consultation_id
    WHERE ti.id = ? AND ti.contract_id = ? AND c.id = ?
    `,
    [timelineItemId, contractId, consultationId]
  );
}

async function getLatestConsultationContract(consultationId) {
  if (!consultationId) {
    return null;
  }

  return db.get(
    `
    SELECT 
      cc.id,
      cc.project_cost,
      cc.file_path,
      cc.original_filename,
      cc.uploaded_at
    FROM consultation_contracts cc
    WHERE cc.consultation_id = ?
    ORDER BY cc.uploaded_at DESC, cc.id DESC
    LIMIT 1
    `,
    [consultationId]
  );
}

function calculateCancellationFee(projectCost, percent) {
  const baseCost = Number(projectCost) || 0;
  const pct = Number(percent);
  if (!Number.isFinite(baseCost) || baseCost <= 0 || !Number.isFinite(pct) || pct <= 0) {
    return 0;
  }
  return Number(((baseCost * pct) / 100).toFixed(2));
}

function parseCurrencyInput(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return NaN;
  }
  if (typeof rawValue === 'number') {
    return rawValue;
  }
  const cleaned = String(rawValue).replace(/,/g, '').trim();
  if (cleaned.length === 0) {
    return NaN;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : NaN;
}

// Get all consultation types
router.get('/types', async (req, res) => {
  try {
    const types = await db.all('SELECT * FROM consultation_types ORDER BY id');
    res.json(types);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all design categories
router.get('/design-categories', async (req, res) => {
  try {
    const categories = await db.all('SELECT * FROM design_categories ORDER BY id');
    res.json(categories);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all design styles
router.get('/design-styles', async (req, res) => {
  try {
    const styles = await db.all('SELECT * FROM design_styles ORDER BY id');
    res.json(styles);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new consultation (protected route)
router.post(
  '/',
  userOnlyMiddleware,
  consultationUpload.fields([
    { name: 'referenceImageOne', maxCount: 1 },
    { name: 'referenceImageTwo', maxCount: 1 },
    { name: 'referenceImages', maxCount: 2 }
  ]),
  async (req, res) => {
  const {
    serviceId,
    consultationTypeId,
    designCategoryId,
    designStyleId,
    consultationDate,
    consultationTime,
    address,
    notes
  } = req.body;

  const parseOptionalId = (value) => {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : NaN;
  };

  const parsedServiceId = Number(serviceId);
  const parsedConsultationTypeId = Number(consultationTypeId);
  const parsedDesignCategoryId = parseOptionalId(designCategoryId);
  const parsedDesignStyleId = parseOptionalId(designStyleId);

  const filesByField = req.files || {};
  const seenFilenames = new Set();
  const orderedFiles = [];

  const enqueueFiles = (files) => {
    if (!Array.isArray(files)) {
      return;
    }
    for (const file of files) {
      if (file && !seenFilenames.has(file.filename)) {
        orderedFiles.push(file);
        seenFilenames.add(file.filename);
      }
    }
  };

  enqueueFiles(filesByField.referenceImageOne);
  enqueueFiles(filesByField.referenceImageTwo);
  enqueueFiles(filesByField.referenceImages);

  const retainedFiles = orderedFiles.slice(0, 2);
  const uploadedImages = retainedFiles.map((file) => toConsultationImagePath(file.filename));

  const discardedFiles = orderedFiles.slice(2);
  if (discardedFiles.length > 0) {
    const discardPaths = discardedFiles.map((file) => toConsultationImagePath(file.filename));
    await deleteConsultationImages(discardPaths);
  }

  const fail = async (status, message) => {
    await deleteConsultationImages(uploadedImages);
    return res.status(status).json({ error: message });
  };

  // Validation
  if (!req.user || !req.user.id) {
    return fail(401, 'User authentication required');
  }

  if (!serviceId || !consultationTypeId || !consultationDate) {
    return fail(400, 'Service ID, consultation type, and consultation date are required');
  }

  if (!Number.isInteger(parsedServiceId) || parsedServiceId <= 0) {
    return fail(400, 'serviceId harus berupa angka');
  }

  if (!Number.isInteger(parsedConsultationTypeId) || parsedConsultationTypeId <= 0) {
    return fail(400, 'consultationTypeId harus berupa angka');
  }

  if (Number.isNaN(parsedDesignCategoryId)) {
    return fail(400, 'designCategoryId harus berupa angka jika diisi');
  }

  if (Number.isNaN(parsedDesignStyleId)) {
    return fail(400, 'designStyleId harus berupa angka jika diisi');
  }

  try {
    // Verify service exists
    const service = await db.get('SELECT id FROM services WHERE id = ?', [parsedServiceId]);
    if (!service) {
      return fail(404, 'Service not found');
    }

    const designSelectionRequired = !OPTIONAL_DESIGN_SERVICE_IDS.has(parsedServiceId);

    if (designSelectionRequired) {
      if (parsedDesignCategoryId === null || parsedDesignStyleId === null) {
        return fail(400, 'Design category dan design style wajib dipilih untuk layanan ini');
      }
    }

    // Verify consultation type exists
    const consultationType = await db.get('SELECT id FROM consultation_types WHERE id = ?', [parsedConsultationTypeId]);
    if (!consultationType) {
      return fail(404, 'Consultation type not found');
    }

    // Verify design category exists
    if (parsedDesignCategoryId !== null) {
      const designCategory = await db.get('SELECT id FROM design_categories WHERE id = ?', [parsedDesignCategoryId]);
      if (!designCategory) {
        return fail(404, 'Design category not found');
      }
    }

    // Verify design style exists
    if (parsedDesignStyleId !== null) {
      const designStyle = await db.get('SELECT id FROM design_styles WHERE id = ?', [parsedDesignStyleId]);
      if (!designStyle) {
        return fail(404, 'Design style not found');
      }
    }

    // Insert consultation
    const result = await db.run(`
      INSERT INTO consultations (
        user_id, service_id, consultation_type_id, design_category_id, 
        design_style_id, consultation_date, consultation_time, address, notes,
        reference_image_primary, reference_image_secondary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.user.id,
      parsedServiceId,
      parsedConsultationTypeId,
      parsedDesignCategoryId,
      parsedDesignStyleId,
      consultationDate,
      consultationTime || null,
      address || null,
      notes || null,
      uploadedImages[0] || null,
      uploadedImages[1] || null
    ]);

    res.status(201).json({ 
      message: 'Consultation scheduled successfully',
      consultationId: result.lastID,
      referenceImages: uploadedImages
    });
  } catch (error) {
    console.error(error);
    await deleteConsultationImages(uploadedImages);
    res.status(500).json({ error: 'Internal server error' });
  }
  }
);

// Get user's consultations (protected route)
router.get('/', userOnlyMiddleware, async (req, res) => {
  try {
    const consultations = await db.all(`
      SELECT 
        c.*,
        s.name as service_name,
        s.description as service_description,
        ct.name as consultation_type_name,
        dc.name as design_category_name,
        ds.name as design_style_name
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      JOIN consultation_types ct ON c.consultation_type_id = ct.id
      LEFT JOIN design_categories dc ON c.design_category_id = dc.id
      LEFT JOIN design_styles ds ON c.design_style_id = ds.id
      WHERE c.user_id = ?
      ORDER BY c.created_at DESC
    `, [req.user.id]);

    res.json(consultations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload or replace consultation contract (admin)
router.post(
  '/:id/contracts',
  adminAuthMiddleware,
  contractUpload.single('contract'),
  async (req, res) => {
    const consultationId = Number(req.params.id);
    if (!Number.isInteger(consultationId) || consultationId <= 0) {
      if (req.file) {
        await deleteContractFile(toContractPath(req.file.filename));
      }
      return res.status(400).json({ error: 'Invalid consultation ID' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Contract PDF is required' });
    }

    const relativePath = toContractPath(req.file.filename);

    try {
      const consultation = await db.get(`
        SELECT 
          c.id,
          c.user_id,
          c.consultation_date,
          c.status,
          u.username AS user_name
        FROM consultations c
        JOIN users u ON c.user_id = u.id
        WHERE c.id = ?
      `, [consultationId]);

      if (!consultation) {
        await deleteContractFile(relativePath);
        return res.status(404).json({ error: 'Consultation not found' });
      }

      const existingContract = await db.get(
        'SELECT id, file_path, project_cost FROM consultation_contracts WHERE consultation_id = ?',
        [consultationId]
      );

      const rawProjectCost = req.body?.projectCost ?? req.body?.project_cost;
      let parsedProjectCost = parseCurrencyInput(rawProjectCost);

      if (Number.isNaN(parsedProjectCost) || parsedProjectCost <= 0) {
        const fallbackCost = Number(existingContract?.project_cost);
        if (fallbackCost > 0) {
          parsedProjectCost = fallbackCost;
        }
      }

      if (Number.isNaN(parsedProjectCost) || parsedProjectCost <= 0) {
        await deleteContractFile(relativePath);
        return res.status(400).json({ error: 'projectCost wajib diisi dalam format angka lebih dari 0' });
      }

      let contractId;
      if (existingContract) {
        await db.run(
          `UPDATE consultation_contracts
           SET admin_id = ?, file_path = ?, original_filename = ?, project_cost = ?, uploaded_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [req.user?.id || null, relativePath, req.file.originalname, parsedProjectCost, existingContract.id]
        );
        contractId = existingContract.id;
        if (existingContract.file_path && existingContract.file_path !== relativePath) {
          await deleteContractFile(existingContract.file_path);
        }
      } else {
        const result = await db.run(
          `INSERT INTO consultation_contracts (consultation_id, admin_id, project_cost, file_path, original_filename)
           VALUES (?, ?, ?, ?, ?)`,
          [consultationId, req.user?.id || null, parsedProjectCost, relativePath, req.file.originalname]
        );
        contractId = result.lastID;
      }

      let contractRecord = {
        id: contractId,
        consultation_id: consultationId,
        file_path: relativePath,
        original_filename: req.file.originalname,
        uploaded_at: new Date().toISOString(),
        admin_id: req.user?.id || null,
        project_cost: parsedProjectCost
      };

      try {
        const freshRecord = await db.get(`
          SELECT 
            cc.id,
            cc.consultation_id,
            cc.project_cost,
            cc.file_path,
            cc.original_filename,
            cc.uploaded_at,
            cc.admin_id
          FROM consultation_contracts cc
          WHERE cc.id = ?
        `, [contractId]);
        if (freshRecord) {
          contractRecord = freshRecord;
        }
      } catch (fetchError) {
        console.warn('Contract saved but failed to fetch refreshed record:', fetchError);
      }

      if (consultation.status !== 'cancelled') {
        // Saat kontrak terunggah, tandai siap terima DP/pembayaran awal
        await db.run(
          `UPDATE consultations
           SET 
             status = CASE 
               WHEN status IN ('cancelled', 'finalized') THEN status
             ELSE 'awaiting_payment'
           END,
             payment_status = CASE
              WHEN payment_status IN ('paid', 'dp_paid', 'not_ready_final', 'awaiting_final_payment', 'awaiting_cancellation_fee', 'cancellation_fee_recorded') THEN payment_status
              ELSE 'awaiting_payment'
             END,
             final_delivery_status = CASE
               WHEN final_delivery_status = 'not_ready' THEN 'withheld'
               ELSE final_delivery_status
             END
           WHERE id = ?`,
          [consultationId]
        );
        await updateConsultationStatusIfAllowed(consultationId, 'contract_uploaded');
      }

      return res.status(existingContract ? 200 : 201).json({
        message: existingContract ? 'Consultation contract replaced successfully' : 'Consultation contract uploaded successfully',
        contract: {
          id: contractRecord.id,
          consultationId: contractRecord.consultation_id,
          filePath: contractRecord.file_path,
          originalFilename: contractRecord.original_filename,
          uploadedAt: contractRecord.uploaded_at,
          adminId: contractRecord.admin_id,
          projectCost: Number(contractRecord.project_cost) || 0,
          userId: consultation.user_id,
          userName: consultation.user_name
        }
      });
    } catch (error) {
      console.error('Failed to upload consultation contract:', error);
      await deleteContractFile(relativePath);
      return res.status(500).json({ error: 'Failed to upload consultation contract' });
    }
  }
);

// Get consultation contract and timeline (user/admin)
router.get('/:id/contracts', authMiddleware, async (req, res) => {
  const consultationId = Number(req.params.id);
  if (!Number.isInteger(consultationId) || consultationId <= 0) {
    return res.status(400).json({ error: 'Invalid consultation ID' });
  }

  try {
    const contract = await db.get(`
      SELECT 
        cc.id,
        cc.consultation_id,
        cc.project_cost,
        cc.file_path,
        cc.original_filename,
        cc.uploaded_at,
        cc.admin_id,
        c.user_id,
        c.status AS consultation_status,
        c.payment_status,
        c.cancellation_fee_percent,
        c.cancellation_fee_amount,
        c.final_delivery_status,
        c.final_delivery_note,
        c.pre_contract_meet_link,
        c.pre_contract_meet_datetime,
        u.username AS user_name
      FROM consultation_contracts cc
      JOIN consultations c ON cc.consultation_id = c.id
      JOIN users u ON c.user_id = u.id
      WHERE cc.consultation_id = ?
    `, [consultationId]);

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found for consultation' });
    }

    if (!req.user?.isAdmin && contract.user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const timelineItems = await db.all(`
      SELECT 
        ti.id,
        ti.contract_id,
        ti.title,
        ti.description,
        ti.activity_type,
        ti.status,
        ti.due_date,
        ti.meeting_datetime,
        ti.meeting_link,
        ti.result_file_path,
        ti.result_original_filename,
        ti.result_uploaded_at,
        ti.result_uploaded_by_admin_id,
        ti.order_index,
        ti.created_at,
        ti.updated_at,
        COALESCE(ccount.total_comments, 0) AS comment_count
      FROM consultation_timeline_items ti
      LEFT JOIN (
        SELECT timeline_item_id, COUNT(*) AS total_comments
        FROM consultation_timeline_comments
        GROUP BY timeline_item_id
      ) ccount ON ccount.timeline_item_id = ti.id
      WHERE ti.contract_id = ?
      ORDER BY ti.order_index ASC, ti.id ASC
    `, [contract.id]);

    return res.json({
      contract: {
        id: contract.id,
        consultationId: contract.consultation_id,
        projectCost: Number(contract.project_cost) || 0,
        filePath: contract.file_path,
        originalFilename: contract.original_filename,
        uploadedAt: contract.uploaded_at,
        adminId: contract.admin_id,
        userId: contract.user_id,
        userName: contract.user_name,
        consultationStatus: contract.consultation_status,
        paymentStatus: contract.payment_status,
        cancellationFeePercent: Number(contract.cancellation_fee_percent) || 0,
        cancellationFeeAmount: Number(contract.cancellation_fee_amount) || 0,
        finalDeliveryStatus: contract.final_delivery_status,
        finalDeliveryNote: contract.final_delivery_note,
        preContractMeetLink: contract.pre_contract_meet_link,
        preContractMeetDatetime: contract.pre_contract_meet_datetime
      },
      timeline: timelineItems
    });
  } catch (error) {
    console.error('Failed to fetch consultation contract:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Download consultation contract file (user/admin)
router.get('/:id/contracts/:contractId/download', authMiddleware, async (req, res) => {
  const consultationId = Number(req.params.id);
  const contractId = Number(req.params.contractId);

  if (!Number.isInteger(consultationId) || consultationId <= 0 || !Number.isInteger(contractId) || contractId <= 0) {
    return res.status(400).json({ error: 'Invalid consultation or contract ID' });
  }

  try {
    const contract = await db.get(`
      SELECT 
        cc.file_path,
        cc.original_filename,
        c.user_id
      FROM consultation_contracts cc
      JOIN consultations c ON cc.consultation_id = c.id
      WHERE cc.id = ? AND cc.consultation_id = ?
    `, [contractId, consultationId]);

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    if (!req.user?.isAdmin && contract.user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const absolutePath = path.normalize(path.join(__dirname, '..', contract.file_path));
    const uploadsRoot = path.normalize(contractUploadsDir);

    if (!absolutePath.startsWith(uploadsRoot)) {
      return res.status(400).json({ error: 'Invalid contract file path' });
    }

    try {
      await fsPromises.access(absolutePath, fs.constants.R_OK);
    } catch {
      return res.status(404).json({ error: 'Contract file not found' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    return res.download(absolutePath, contract.original_filename);
  } catch (error) {
    console.error('Failed to download consultation contract:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Create or replace consultation timeline items (admin)
router.post('/:id/contracts/:contractId/timeline', adminAuthMiddleware, async (req, res) => {
  const consultationId = Number(req.params.id);
  const contractId = Number(req.params.contractId);
  const { items, useDefaultTemplate } = req.body || {};

  if (!Number.isInteger(consultationId) || consultationId <= 0 || !Number.isInteger(contractId) || contractId <= 0) {
    return res.status(400).json({ error: 'Invalid consultation or contract ID' });
  }

  try {
    const contract = await db.get(`
      SELECT 
        cc.id,
        cc.consultation_id,
        c.user_id,
        c.consultation_date,
        u.username AS user_name
      FROM consultation_contracts cc
      JOIN consultations c ON c.id = cc.consultation_id
      JOIN users u ON u.id = c.user_id
      WHERE cc.id = ? AND cc.consultation_id = ?
    `, [contractId, consultationId]);

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found for consultation' });
    }

    const existingOrderStats = await db.get(
      `
      SELECT COALESCE(MAX(order_index), 0) AS max_order
      FROM consultation_timeline_items
      WHERE contract_id = ?
      `,
      [contractId]
    );
    let autoOrderCounter = Number(existingOrderStats?.max_order) || 0;

    let timelinePayload = Array.isArray(items) ? items : [];
    if (timelinePayload.length === 0 && useDefaultTemplate) {
      timelinePayload = DEFAULT_TIMELINE_TEMPLATE.map((entry, index) => ({
        title: substituteClientName(entry.title, contract.user_name).trim(),
        description: substituteClientName(entry.description, contract.user_name),
        status: 'pending',
        dueDate: computeDueDate(contract.consultation_date, entry.offsetDays),
        activityType: entry.activityType || 'progress'
      }));
    }

    if (!Array.isArray(timelinePayload) || timelinePayload.length === 0) {
      return res.status(400).json({ error: 'Timeline items are required' });
    }

    const sanitizedItems = [];
    for (let index = 0; index < timelinePayload.length; index += 1) {
      const rawItem = timelinePayload[index] || {};
      const title = typeof rawItem.title === 'string' ? rawItem.title.trim() : '';
      if (!title) {
        return res.status(400).json({ error: `Timeline item ${index + 1} is missing a title` });
      }

      const description = typeof rawItem.description === 'string' && rawItem.description.trim().length > 0
        ? rawItem.description.trim()
        : null;

      const rawType =
        typeof rawItem.activityType === 'string'
          ? rawItem.activityType.trim().toLowerCase()
          : typeof rawItem.activity_type === 'string'
            ? rawItem.activity_type.trim().toLowerCase()
            : 'progress';

      if (!TIMELINE_ACTIVITY_TYPES.has(rawType)) {
        return res.status(400).json({ error: `Timeline item ${index + 1} memiliki activityType tidak valid` });
      }

      const status = typeof rawItem.status === 'string' && TIMELINE_STATUSES.has(rawItem.status)
        ? rawItem.status
        : 'pending';

      const candidateOrderIndex = Number.isInteger(rawItem.orderIndex)
        ? rawItem.orderIndex
        : Number.isInteger(rawItem.order_index)
          ? rawItem.order_index
          : null;

      let orderIndex;
      if (Number.isInteger(candidateOrderIndex)) {
        orderIndex = candidateOrderIndex;
      } else {
        autoOrderCounter += 1;
        orderIndex = autoOrderCounter;
      }

      const dueDateInput = rawItem.dueDate ?? rawItem.due_date ?? null;
      const dueDate = dueDateInput ? normalizeDateString(dueDateInput) : null;

      const meetingDatetimeInput = rawItem.meetingDatetime ?? rawItem.meeting_datetime ?? null;
      const meetingDatetime = meetingDatetimeInput ? normalizeDateTimeString(meetingDatetimeInput) : null;
      const meetingLink = typeof rawItem.meetingLink === 'string'
        ? rawItem.meetingLink.trim()
        : typeof rawItem.meeting_link === 'string'
          ? rawItem.meeting_link.trim()
          : null;

      if (rawType === 'meeting') {
        if (!meetingDatetime) {
          return res.status(400).json({ error: `Timeline item ${index + 1} membutuhkan meetingDatetime valid` });
        }
      } else if (!dueDate) {
        return res.status(400).json({ error: `Timeline item ${index + 1} membutuhkan dueDate valid` });
      }

      sanitizedItems.push({
        title,
        description,
        activityType: rawType,
        status,
        dueDate,
        meetingDatetime: rawType === 'meeting' ? meetingDatetime : null,
        meetingLink: rawType === 'meeting' && meetingLink ? meetingLink : null,
        orderIndex
      });
    }

    const insertedItems = [];
    for (const item of sanitizedItems) {
      const result = await db.run(
        `INSERT INTO consultation_timeline_items
         (contract_id, title, description, activity_type, status, due_date, meeting_datetime, meeting_link, order_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          contractId,
          item.title,
          item.description,
          item.activityType,
          item.status,
          item.dueDate,
          item.meetingDatetime,
          item.meetingLink,
          item.orderIndex
        ]
      );

      insertedItems.push({
        id: result.lastID,
        contractId,
        title: item.title,
        description: item.description,
        activityType: item.activityType,
        status: item.status,
        dueDate: item.dueDate,
        meetingDatetime: item.meetingDatetime,
        meetingLink: item.meetingLink,
        orderIndex: item.orderIndex
      });
    }

    await updateConsultationStatusIfAllowed(consultationId, 'timeline_in_progress');
    await syncContractPaymentStage(contractId);

    return res.status(201).json({
      message: 'Consultation timeline saved successfully',
      contractId,
      timeline: insertedItems
    });
  } catch (error) {
    console.error('Failed to create consultation timeline:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Update timeline item progress (admin)
router.patch('/:id/contracts/:contractId/timeline/:timelineItemId', adminAuthMiddleware, handleTimelineResultUpload, async (req, res) => {
  const consultationId = Number(req.params.id);
  const contractId = Number(req.params.contractId);
  const timelineItemId = Number(req.params.timelineItemId);
  const uploadedResultRelativePath = req.file ? toTimelineResultPath(req.file.filename) : null;

  if (
    !Number.isInteger(consultationId) ||
    consultationId <= 0 ||
    !Number.isInteger(contractId) ||
    contractId <= 0 ||
    !Number.isInteger(timelineItemId) ||
    timelineItemId <= 0
  ) {
    return res.status(400).json({ error: 'Invalid consultation, contract, or timeline item ID' });
  }

  const cleanupUpload = async () => {
    if (uploadedResultRelativePath) {
      await deleteTimelineResultFile(uploadedResultRelativePath);
    }
  };

  const { status, dueDate } = req.body || {};
  const meetingDatetimeInput = req.body?.meetingDatetime ?? req.body?.meeting_datetime;
  const meetingLinkInput = req.body?.meetingLink ?? req.body?.meeting_link;
  const titleInput = req.body?.title;
  const descriptionInput = req.body?.description;
  const activityTypeInput = req.body?.activityType ?? req.body?.activity_type;
  const orderIndexInput = req.body?.orderIndex ?? req.body?.order_index;

  if (
    !status &&
    typeof dueDate === 'undefined' &&
    typeof meetingDatetimeInput === 'undefined' &&
    typeof meetingLinkInput === 'undefined' &&
    typeof titleInput === 'undefined' &&
    typeof descriptionInput === 'undefined' &&
    typeof activityTypeInput === 'undefined' &&
    typeof orderIndexInput === 'undefined' &&
    !req.file
  ) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  if (status && !TIMELINE_STATUSES.has(status)) {
    return res.status(400).json({ error: 'Invalid timeline status' });
  }

  const normalizedDueDate = typeof dueDate === 'undefined'
    ? undefined
    : dueDate === null || dueDate === ''
      ? null
      : normalizeDateString(dueDate);

  const normalizedMeetingDatetime = typeof meetingDatetimeInput === 'undefined'
    ? undefined
    : meetingDatetimeInput === null || meetingDatetimeInput === ''
      ? null
      : normalizeDateTimeString(meetingDatetimeInput);

  const normalizedMeetingLink = typeof meetingLinkInput === 'undefined'
    ? undefined
    : meetingLinkInput === null
      ? null
      : String(meetingLinkInput).trim() || null;

  const normalizedTitle = typeof titleInput === 'undefined'
    ? undefined
    : String(titleInput).trim();

  if (typeof normalizedTitle !== 'undefined' && normalizedTitle.length === 0) {
    await cleanupUpload();
    return res.status(400).json({ error: 'title tidak boleh kosong' });
  }

  const normalizedDescription = typeof descriptionInput === 'undefined'
    ? undefined
    : (typeof descriptionInput === 'string' && descriptionInput.trim().length > 0
        ? descriptionInput.trim()
        : null);

  const normalizedActivityType = typeof activityTypeInput === 'undefined'
    ? undefined
    : String(activityTypeInput).trim().toLowerCase();

  if (typeof normalizedActivityType !== 'undefined' && !TIMELINE_ACTIVITY_TYPES.has(normalizedActivityType)) {
    await cleanupUpload();
    return res.status(400).json({ error: 'activityType tidak valid' });
  }

  const normalizedOrderIndex = typeof orderIndexInput === 'undefined'
    ? undefined
    : Number(orderIndexInput);

  if (typeof normalizedOrderIndex !== 'undefined' && !Number.isInteger(normalizedOrderIndex)) {
    await cleanupUpload();
    return res.status(400).json({ error: 'orderIndex harus bilangan bulat' });
  }

  if (typeof normalizedDueDate !== 'undefined' && normalizedDueDate === null && dueDate) {
    await cleanupUpload();
    return res.status(400).json({ error: 'dueDate tidak valid' });
  }

  if (typeof normalizedMeetingDatetime !== 'undefined' && normalizedMeetingDatetime === null && meetingDatetimeInput) {
    await cleanupUpload();
    return res.status(400).json({ error: 'meetingDatetime tidak valid' });
  }

  let timelineUpdated = false;
  try {
    const access = await loadTimelineItemAccess(consultationId, contractId, timelineItemId);

    if (!access) {
      await cleanupUpload();
      return res.status(404).json({ error: 'Timeline item not found for consultation' });
    }

    const nextActivityType = normalizedActivityType || access.activity_type;

    if (status === 'completed' && nextActivityType === 'finalization' && access.payment_status !== 'paid') {
      await cleanupUpload();
      return res.status(400).json({ error: 'Customer belum melunasi pembayaran, finalisasi tidak boleh diselesaikan' });
    }

    if (req.file && nextActivityType === 'meeting') {
      await cleanupUpload();
      return res.status(400).json({ error: 'Meeting tidak membutuhkan file hasil' });
    }

    if (req.file && status !== 'completed') {
      await cleanupUpload();
      return res.status(400).json({ error: 'File hasil hanya boleh diunggah saat status diset menjadi completed' });
    }

    if (
      status === 'completed' &&
      ['progress', 'finalization'].includes(nextActivityType) &&
      !req.file
    ) {
      await cleanupUpload();
      return res.status(400).json({ error: 'Mohon unggah file hasil ketika menandai progress/finalisasi selesai' });
    }

    if (typeof normalizedDueDate !== 'undefined' && nextActivityType === 'meeting') {
      await cleanupUpload();
      return res.status(400).json({ error: 'dueDate tidak berlaku untuk aktivitas meeting' });
    }

    if (typeof normalizedMeetingDatetime !== 'undefined' && nextActivityType !== 'meeting') {
      await cleanupUpload();
      return res.status(400).json({ error: 'meetingDatetime hanya untuk aktivitas meeting' });
    }

    if (typeof normalizedMeetingLink !== 'undefined' && nextActivityType !== 'meeting') {
      await cleanupUpload();
      return res.status(400).json({ error: 'meetingLink hanya untuk aktivitas meeting' });
    }

    // If changing activity type, ensure required fields are available
    if (normalizedActivityType) {
      if (nextActivityType === 'meeting') {
        const effectiveMeetingDatetime = typeof normalizedMeetingDatetime !== 'undefined'
          ? normalizedMeetingDatetime
          : access.meeting_datetime;
        if (!effectiveMeetingDatetime) {
          await cleanupUpload();
          return res.status(400).json({ error: 'meetingDatetime wajib untuk aktivitas meeting' });
        }
      } else {
        const effectiveDueDate = typeof normalizedDueDate !== 'undefined'
          ? normalizedDueDate
          : access.due_date;
        if (!effectiveDueDate) {
          await cleanupUpload();
          return res.status(400).json({ error: 'dueDate wajib untuk aktivitas progress/finalization' });
        }
      }
    }

    const updates = [];
    const params = [];

    if (normalizedTitle !== undefined) {
      updates.push('title = ?');
      params.push(normalizedTitle);
    }

    if (normalizedDescription !== undefined) {
      updates.push('description = ?');
      params.push(normalizedDescription);
    }

    if (normalizedActivityType !== undefined) {
      updates.push('activity_type = ?');
      params.push(nextActivityType);
    }

    if (status) {
      updates.push('status = ?');
      params.push(status);
    }

    if (normalizedDueDate !== undefined) {
      updates.push('due_date = ?');
      params.push(normalizedDueDate);
    }

    if (normalizedMeetingDatetime !== undefined) {
      updates.push('meeting_datetime = ?');
      params.push(normalizedMeetingDatetime);
    }

    if (normalizedMeetingLink !== undefined) {
      updates.push('meeting_link = ?');
      params.push(normalizedMeetingLink);
    }

    if (normalizedOrderIndex !== undefined) {
      updates.push('order_index = ?');
      params.push(normalizedOrderIndex);
    }

    // Normalize fields when activity type changes
    if (normalizedActivityType !== undefined) {
      if (nextActivityType === 'meeting') {
        updates.push('due_date = NULL');
        updates.push('result_file_path = NULL');
        updates.push('result_original_filename = NULL');
        updates.push('result_uploaded_at = NULL');
        updates.push('result_uploaded_by_admin_id = NULL');
      } else {
        updates.push('meeting_datetime = NULL');
        updates.push('meeting_link = NULL');
      }
    }

    let newResultFilePath = null;
    if (req.file) {
      newResultFilePath = uploadedResultRelativePath;
      updates.push('result_file_path = ?');
      params.push(newResultFilePath);
      updates.push('result_original_filename = ?');
      params.push(req.file.originalname || req.file.filename);
      updates.push('result_uploaded_at = CURRENT_TIMESTAMP');
      updates.push('result_uploaded_by_admin_id = ?');
      params.push(req.user?.id || null);
    }

    if (updates.length === 0) {
      await cleanupUpload();
      return res.status(400).json({ error: 'Nothing to update' });
    }

    params.push(timelineItemId);

    await db.run(
      `UPDATE consultation_timeline_items
       SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      params
    );
    timelineUpdated = true;

    if (newResultFilePath && access.result_file_path && access.result_file_path !== newResultFilePath) {
      await deleteTimelineResultFile(access.result_file_path);
    } else if (!newResultFilePath && normalizedActivityType && nextActivityType === 'meeting' && access.result_file_path) {
      await deleteTimelineResultFile(access.result_file_path);
    }

    const updatedItem = await db.get(
      `
      SELECT 
        id,
        contract_id,
        title,
        description,
        activity_type,
        status,
        due_date,
        meeting_datetime,
        meeting_link,
        result_file_path,
        result_original_filename,
        result_uploaded_at,
        result_uploaded_by_admin_id,
        order_index,
        created_at,
        updated_at
      FROM consultation_timeline_items
      WHERE id = ?
      `,
      [timelineItemId]
    );

    await syncContractPaymentStage(contractId);

    return res.json({
      message: 'Timeline item updated',
      timelineItem: updatedItem
    });
  } catch (error) {
    if (!timelineUpdated) {
      await cleanupUpload();
    }
    console.error('Failed to update timeline item:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Fetch consultation timeline items (user/admin)
router.get('/:id/contracts/:contractId/timeline', authMiddleware, async (req, res) => {
  const consultationId = Number(req.params.id);
  const contractId = Number(req.params.contractId);

  if (!Number.isInteger(consultationId) || consultationId <= 0 || !Number.isInteger(contractId) || contractId <= 0) {
    return res.status(400).json({ error: 'Invalid consultation or contract ID' });
  }

  try {
    const contract = await db.get(`
      SELECT 
        cc.id,
        c.user_id
      FROM consultation_contracts cc
      JOIN consultations c ON c.id = cc.consultation_id
      WHERE cc.id = ? AND cc.consultation_id = ?
    `, [contractId, consultationId]);

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found for consultation' });
    }

    if (!req.user?.isAdmin && contract.user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const timelineItems = await db.all(`
      SELECT 
        ti.id,
        ti.contract_id,
        ti.title,
        ti.description,
        ti.activity_type,
        ti.status,
        ti.due_date,
        ti.meeting_datetime,
        ti.meeting_link,
        ti.result_file_path,
        ti.result_original_filename,
        ti.result_uploaded_at,
        ti.result_uploaded_by_admin_id,
        ti.order_index,
        ti.created_at,
        ti.updated_at,
        COALESCE(ccount.total_comments, 0) AS comment_count
      FROM consultation_timeline_items ti
      LEFT JOIN (
        SELECT timeline_item_id, COUNT(*) AS total_comments
        FROM consultation_timeline_comments
        GROUP BY timeline_item_id
      ) ccount ON ccount.timeline_item_id = ti.id
      WHERE ti.contract_id = ?
      ORDER BY ti.order_index ASC, ti.id ASC
    `, [contractId]);

    return res.json({
      contractId,
      timeline: timelineItems
    });
  } catch (error) {
    console.error('Failed to fetch consultation timeline:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Fetch comments for a timeline item (user/admin)
router.get('/:id/contracts/:contractId/timeline/:timelineItemId/comments', authMiddleware, async (req, res) => {
  const consultationId = Number(req.params.id);
  const contractId = Number(req.params.contractId);
  const timelineItemId = Number(req.params.timelineItemId);

  if (
    !Number.isInteger(consultationId) ||
    !Number.isInteger(contractId) ||
    !Number.isInteger(timelineItemId) ||
    consultationId <= 0 ||
    contractId <= 0 ||
    timelineItemId <= 0
  ) {
    return res.status(400).json({ error: 'Invalid identifiers' });
  }

  try {
    const access = await loadTimelineItemAccess(consultationId, contractId, timelineItemId);
    if (!access) {
      return res.status(404).json({ error: 'Timeline item not found for consultation' });
    }

    if (!req.user?.isAdmin && access.user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const comments = await db.all(
      `
      SELECT 
        ctc.id,
        ctc.timeline_item_id,
        ctc.author_type,
        ctc.author_user_id,
        ctc.author_admin_id,
        ctc.message,
        ctc.created_at,
        CASE 
          WHEN ctc.author_type = 'admin' THEN admins.name
          ELSE users.username
        END AS author_name
      FROM consultation_timeline_comments ctc
      LEFT JOIN admins ON admins.id = ctc.author_admin_id
      LEFT JOIN users ON users.id = ctc.author_user_id
      WHERE ctc.timeline_item_id = ?
      ORDER BY ctc.created_at ASC, ctc.id ASC
      `,
      [timelineItemId]
    );

    return res.json({
      timelineItemId,
      comments
    });
  } catch (error) {
    console.error('Failed to fetch timeline comments:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Add comment to a timeline item (user/admin)
router.post('/:id/contracts/:contractId/timeline/:timelineItemId/comments', authMiddleware, async (req, res) => {
  const consultationId = Number(req.params.id);
  const contractId = Number(req.params.contractId);
  const timelineItemId = Number(req.params.timelineItemId);

  if (
    !Number.isInteger(consultationId) ||
    !Number.isInteger(contractId) ||
    !Number.isInteger(timelineItemId) ||
    consultationId <= 0 ||
    contractId <= 0 ||
    timelineItemId <= 0
  ) {
    return res.status(400).json({ error: 'Invalid identifiers' });
  }

  const rawMessage = (req.body?.message || '').trim();
  if (!rawMessage) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const access = await loadTimelineItemAccess(consultationId, contractId, timelineItemId);
    if (!access) {
      return res.status(404).json({ error: 'Timeline item not found for consultation' });
    }

    const isAdmin = !!req.user?.isAdmin;
    if (!isAdmin && access.user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const authorType = isAdmin ? 'admin' : 'user';
    const authorUserId = isAdmin ? null : req.user?.id;
    const authorAdminId = isAdmin ? req.user?.id : null;

    const result = await db.run(
      `
      INSERT INTO consultation_timeline_comments
        (timeline_item_id, author_type, author_user_id, author_admin_id, message)
      VALUES (?, ?, ?, ?, ?)
      `,
      [timelineItemId, authorType, authorUserId, authorAdminId, rawMessage]
    );

    const insertedComment = await db.get(
      `
      SELECT 
        ctc.id,
        ctc.timeline_item_id,
        ctc.author_type,
        ctc.author_user_id,
        ctc.author_admin_id,
        ctc.message,
        ctc.created_at,
        CASE 
          WHEN ctc.author_type = 'admin' THEN admins.name
          ELSE users.username
        END AS author_name
      FROM consultation_timeline_comments ctc
      LEFT JOIN admins ON admins.id = ctc.author_admin_id
      LEFT JOIN users ON users.id = ctc.author_user_id
      WHERE ctc.id = ?
      `,
      [result.lastID]
    );

    return res.status(201).json({
      message: 'Comment added',
      comment: insertedComment
    });
  } catch (error) {
    console.error('Failed to add timeline comment:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific consultation by ID (protected route)
router.get('/:id', userOnlyMiddleware, async (req, res) => {
  try {
    const consultation = await db.get(`
      SELECT 
        c.*,
        s.name as service_name,
        s.description as service_description,
        s.image_url as service_image,
        ct.name as consultation_type_name,
        ct.description as consultation_type_description,
        dc.name as design_category_name,
        dc.image_url as design_category_image,
        ds.name as design_style_name,
        ds.image_url as design_style_image
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      JOIN consultation_types ct ON c.consultation_type_id = ct.id
      LEFT JOIN design_categories dc ON c.design_category_id = dc.id
      LEFT JOIN design_styles ds ON c.design_style_id = ds.id
      WHERE c.id = ? AND c.user_id = ?
    `, [req.params.id, req.user.id]);

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' });
    }

    res.json(consultation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Set pre-contract meeting link/datetime (admin)
router.patch('/:id/pre-contract-meeting', adminAuthMiddleware, async (req, res) => {
  const consultationId = Number(req.params.id);
  const meetLinkRaw = req.body?.meetLink ?? req.body?.link ?? req.body?.preContractMeetLink;
  const meetDatetimeRaw = req.body?.meetDatetime ?? req.body?.meet_datetime ?? req.body?.preContractMeetDatetime;

  if (!Number.isInteger(consultationId) || consultationId <= 0) {
    return res.status(400).json({ error: 'Invalid consultation ID' });
  }

  const meetLink = typeof meetLinkRaw === 'string' ? meetLinkRaw.trim() : '';
  if (!meetLink) {
    return res.status(400).json({ error: 'meetLink wajib diisi' });
  }

  const meetDatetime = meetDatetimeRaw ? normalizeDateTimeString(meetDatetimeRaw) : null;
  if (meetDatetimeRaw && meetDatetime === null) {
    return res.status(400).json({ error: 'meetDatetime tidak valid' });
  }

  try {
    const consultation = await db.get(
      'SELECT id, user_id, status FROM consultations WHERE id = ?',
      [consultationId]
    );

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' });
    }

    await db.run(
      `
      UPDATE consultations
      SET pre_contract_meet_link = ?, pre_contract_meet_datetime = ?
      WHERE id = ?
      `,
      [meetLink, meetDatetime, consultationId]
    );

    const refreshed = await db.get(
      `
      SELECT 
        id,
        user_id,
        status,
        pre_contract_meet_link,
        pre_contract_meet_datetime
      FROM consultations
      WHERE id = ?
      `,
      [consultationId]
    );

    return res.json({
      message: 'Pre-contract meeting link updated',
      consultation: refreshed
    });
  } catch (error) {
    console.error('Failed to update pre-contract meeting link:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Update consultation status (protected route - for admin)
router.patch('/:id/status', adminAuthMiddleware, async (req, res) => {
  const { status } = req.body;
  
  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  const validStatuses = [
    'pending',
    'confirmed',
    'contract_uploaded',
    'timeline_in_progress',
    'awaiting_payment',
    'in_progress',
    'completed',
    'finalized',
    'cancelled'
  ];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const result = await db.run(
      'UPDATE consultations SET status = ? WHERE id = ?',
      [status, req.params.id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Consultation not found' });
    }

    res.json({ message: 'Consultation status updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel consultation (protected route)
router.patch('/:id/cancel', userOnlyMiddleware, async (req, res) => {
  try {
    const consultation = await db.get(
      `SELECT 
        id, 
        status, 
        cancellation_fee_percent,
        payment_status
       FROM consultations 
       WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.id]
    );

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' });
    }

    if (['completed', 'cancelled', 'finalized'].includes(consultation.status)) {
      return res.status(400).json({ error: 'Cannot cancel completed or already cancelled consultation' });
    }

    const contract = await getLatestConsultationContract(consultation.id);
    const cancellationFeePercent = consultation.cancellation_fee_percent ?? 10;
    const cancellationFeeAmount = calculateCancellationFee(contract?.project_cost || 0, cancellationFeePercent);
    const dpCoversPenalty = ['dp_paid', 'not_ready_final'].includes(consultation.payment_status);
    const nextPaymentStatus = dpCoversPenalty
      ? 'cancellation_fee_recorded'
      : (cancellationFeeAmount > 0 ? 'awaiting_cancellation_fee' : consultation.payment_status);

    await db.run(
      `UPDATE consultations 
       SET 
         status = 'cancelled',
         payment_status = ?,
         cancellation_fee_amount = ?,
         final_delivery_status = 'withheld'
       WHERE id = ?`,
      [nextPaymentStatus, dpCoversPenalty ? 0 : cancellationFeeAmount, req.params.id]
    );

    res.json({ 
      message: 'Consultation cancelled successfully',
      cancellationFeePercent: Number(cancellationFeePercent) || 0,
      cancellationFeeAmount,
      paymentStatus: nextPaymentStatus
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update payment/final delivery status (admin)
router.patch('/:id/payment-status', adminAuthMiddleware, async (req, res) => {
  const consultationId = Number(req.params.id);
  if (!Number.isInteger(consultationId) || consultationId <= 0) {
    return res.status(400).json({ error: 'Invalid consultation ID' });
  }

  const { paymentStatus, finalDeliveryStatus } = req.body || {};
  const deliveryNote = Object.prototype.hasOwnProperty.call(req.body || {}, 'finalDeliveryNote')
    ? req.body.finalDeliveryNote
    : req.body?.deliveryNote;

  if (!paymentStatus && !finalDeliveryStatus && deliveryNote === undefined) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  if (paymentStatus && !PAYMENT_STATUSES.has(paymentStatus)) {
    return res.status(400).json({ error: 'Invalid payment status' });
  }

  if (finalDeliveryStatus && !DELIVERY_STATUSES.has(finalDeliveryStatus)) {
    return res.status(400).json({ error: 'Invalid final delivery status' });
  }

  try {
    const consultation = await db.get(
      'SELECT id, status FROM consultations WHERE id = ?',
      [consultationId]
    );

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' });
    }

    const updates = [];
    const params = [];

    if (paymentStatus) {
      updates.push('payment_status = ?');
      params.push(paymentStatus);
    }

    let resolvedDeliveryStatus = finalDeliveryStatus;
    if (!resolvedDeliveryStatus && paymentStatus === 'paid') {
      resolvedDeliveryStatus = 'delivered';
    } else if (!resolvedDeliveryStatus && ['awaiting_final_payment', 'awaiting_cancellation_fee', 'dp_paid', 'not_ready_final'].includes(paymentStatus)) {
      resolvedDeliveryStatus = 'withheld';
    }

    if (resolvedDeliveryStatus) {
      updates.push('final_delivery_status = ?');
      params.push(resolvedDeliveryStatus);
    }

    if (deliveryNote !== undefined) {
      updates.push('final_delivery_note = ?');
      params.push(deliveryNote || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    params.push(consultationId);

    await db.run(
      `UPDATE consultations
       SET ${updates.join(', ')}
       WHERE id = ?`,
      params
    );

    if (paymentStatus === 'paid') {
      await updateConsultationStatusIfAllowed(consultationId, 'finalized');
    } else if (paymentStatus === 'awaiting_final_payment') {
      await updateConsultationStatusIfAllowed(consultationId, 'awaiting_payment');
    } else if (paymentStatus === 'awaiting_cancellation_fee') {
      await updateConsultationStatusIfAllowed(consultationId, 'cancelled');
    }

    const refreshed = await db.get(
      `
      SELECT 
        id,
        status,
        payment_status,
        final_delivery_status,
        final_delivery_note,
        cancellation_fee_amount
      FROM consultations
      WHERE id = ?
      `,
      [consultationId]
    );

    return res.json({
      message: 'Payment status updated',
      consultation: refreshed
    });
  } catch (error) {
    console.error('Failed to update payment status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Add consultation type (protected route - admin)
router.post('/types', adminAuthMiddleware, async (req, res) => {
  const { name, description } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const result = await db.run(
      'INSERT INTO consultation_types (name, description) VALUES (?, ?)',
      [name, description]
    );

    res.status(201).json({ 
      message: 'Consultation type added successfully',
      id: result.lastID 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add design category (protected route - admin)
router.post('/design-categories', adminAuthMiddleware, async (req, res) => {
  const { name, imageUrl } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const result = await db.run(
      'INSERT INTO design_categories (name, image_url) VALUES (?, ?)',
      [name, imageUrl]
    );

    res.status(201).json({ 
      message: 'Design category added successfully',
      id: result.lastID 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add design style (protected route - admin)
router.post('/design-styles', adminAuthMiddleware, async (req, res) => {
  const { name, imageUrl } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const result = await db.run(
      'INSERT INTO design_styles (name, image_url) VALUES (?, ?)',
      [name, imageUrl]
    );

    res.status(201).json({ 
      message: 'Design style added successfully',
      id: result.lastID 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all consultations for admin (protected route - admin)
router.get('/admin/all', adminAuthMiddleware, async (req, res) => {
  try {
    const consultations = await db.all(`
      SELECT 
        c.*,
        u.username,
        u.email,
        s.name as service_name,
        ct.name as consultation_type_name,
        dc.name as design_category_name,
        ds.name as design_style_name
      FROM consultations c
      JOIN users u ON c.user_id = u.id
      JOIN services s ON c.service_id = s.id
      JOIN consultation_types ct ON c.consultation_type_id = ct.id
      LEFT JOIN design_categories dc ON c.design_category_id = dc.id
      LEFT JOIN design_styles ds ON c.design_style_id = ds.id
      ORDER BY c.created_at DESC
    `);

    res.json(consultations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

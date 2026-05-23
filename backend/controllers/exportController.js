import { Parser } from 'json2csv';
import * as xlsx from 'xlsx';
import PDFDocument from 'pdfkit';
import { getFilteredActivities } from '../services/activityService.js';

// Helper to parse date filters
const parseFilters = (query) => {
    const { employee, filter, start, end, repository, source } = query;
    let startDate = null;
    let endDate = null;

    if (filter === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        startDate = today.toISOString();
    } else if (filter === 'yesterday') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        startDate = yesterday.toISOString();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        endDate = today.toISOString();
    } else if (filter === 'last7days') {
        const last7 = new Date();
        last7.setDate(last7.getDate() - 7);
        last7.setHours(0, 0, 0, 0);
        startDate = last7.toISOString();
    } else if (start || end) {
        if (start) startDate = new Date(start).toISOString();
        if (end) {
            const endD = new Date(end);
            endD.setHours(23, 59, 59, 999);
            endDate = endD.toISOString();
        }
    }
    
    return { employee: employee || null, startDate, endDate, repository: repository || null, source: source || null };
};

// ── CSV EXPORT ──────────────────────────────────────────────────────────
export const exportCSV = async (req, res) => {
    try {
        console.log(`[ExportController] CSV Export requested by: ${req.user.github_username}`);
        const { employee, startDate, endDate, repository, source } = parseFilters(req.query);
        
        // Pass req.user.id and req.user.role for secure filtering
        const activities = await getFilteredActivities(req.user.id, req.user.role, employee, startDate, endDate, repository, source);

        if (activities.length === 0) {
            return res.status(404).json({ message: 'No activities found for the given filters.' });
        }

        const fields = ['employee_name', 'activity', 'repository_name', 'source', 'commit_hash', 'created_at'];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(activities);

        res.header('Content-Type', 'text/csv');
        res.attachment('activities_report.csv');
        res.send(csv);
        console.log('[ExportController] CSV Export successful.');
    } catch (error) {
        console.error('[ExportController] CSV Export Error:', error);
        res.status(500).json({ message: 'Failed to generate CSV' });
    }
};

// ── EXCEL EXPORT ────────────────────────────────────────────────────────
export const exportExcel = async (req, res) => {
    try {
        console.log(`[ExportController] Excel Export requested by: ${req.user.github_username}`);
        const { employee, startDate, endDate, repository, source } = parseFilters(req.query);
        
        // Pass req.user.id and req.user.role for secure filtering
        const activities = await getFilteredActivities(req.user.id, req.user.role, employee, startDate, endDate, repository, source);

        if (activities.length === 0) {
            return res.status(404).json({ message: 'No activities found for the given filters.' });
        }

        const worksheet = xlsx.utils.json_to_sheet(activities.map(a => ({
            Employee: a.employee_name,
            Activity: a.activity,
            Repository: a.repository_name || 'N/A',
            Source: a.source,
            CommitHash: a.commit_hash || 'N/A',
            Date: new Date(a.created_at).toLocaleString()
        })));

        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Activities');

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.attachment('activities_report.xlsx');
        res.send(buffer);
        console.log('[ExportController] Excel Export successful.');
    } catch (error) {
        console.error('[ExportController] Excel Export Error:', error);
        res.status(500).json({ message: 'Failed to generate Excel' });
    }
};

// ── PDF EXPORT ──────────────────────────────────────────────────────────
export const exportPDF = async (req, res) => {
    try {
        console.log(`[ExportController] PDF Export requested by: ${req.user.github_username}`);
        const { employee, startDate, endDate, repository, source } = parseFilters(req.query);
        
        // Pass req.user.id and req.user.role for secure filtering
        const activities = await getFilteredActivities(req.user.id, req.user.role, employee, startDate, endDate, repository, source);

        if (activities.length === 0) {
            return res.status(404).json({ message: 'No activities found for the given filters.' });
        }

        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        
        res.header('Content-Type', 'application/pdf');
        res.attachment('activities_report.pdf');
        doc.pipe(res);

        // Title
        doc.fontSize(20).text('Activity Report', { align: 'center' });
        doc.moveDown(0.5);
        
        // Report Date & Filters
        doc.fontSize(10).fillColor('gray')
           .text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' })
           .moveDown(1);
        
        doc.fillColor('black').fontSize(12)
           .text(`Filters Applied:`)
           .fontSize(10)
           .text(`Scope: ${req.user.role === 'admin' ? (employee || 'All Employees') : req.user.github_username}`)
           .text(`Repository: ${repository || 'All'}`)
           .text(`Source: ${source || 'All'}`)
           .text(`Start Date: ${startDate || 'Any'}`)
           .text(`End Date: ${endDate || 'Any'}`)
           .moveDown(1);

        // Summary
        doc.fontSize(14).text('Summary', { underline: true }).moveDown(0.5);
        doc.fontSize(10).text(`Total Activities: ${activities.length}`);
        const users = [...new Set(activities.map(a => a.employee_name))];
        doc.text(`Active Users: ${users.join(', ')}`);
        doc.moveDown(1);

        // Activities List
        doc.fontSize(14).text('Activities', { underline: true }).moveDown(0.5);
        
        activities.forEach((act, i) => {
            doc.fontSize(10).fillColor('black').text(`${i + 1}. [${act.source.toUpperCase()}] ${act.employee_name} - ${new Date(act.created_at).toLocaleString()}`);
            if (act.repository_name) {
                doc.fontSize(9).fillColor('gray').text(`    Repository: ${act.repository_name}`);
            }
            doc.fontSize(10).fillColor('black').text(`    Activity: ${act.activity}`);
            doc.moveDown(0.5);
        });

        doc.end();
        console.log('[ExportController] PDF Export successful.');
    } catch (error) {
        console.error('[ExportController] PDF Export Error:', error);
        res.status(500).json({ message: 'Failed to generate PDF' });
    }
};

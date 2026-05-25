import { Parser } from 'json2csv';
import * as xlsx from 'xlsx';
import PDFDocument from 'pdfkit';
import { getFilteredActivities } from '../services/activityService.js';
import { pool } from '../database/db.js';

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

// Helper to retrieve filtered Pull Requests — scoped by authenticated user
const getFilteredPRs = async (userId, userRole, authorUsername, startDate, endDate, repository) => {
    let prQuery = `SELECT * FROM pull_requests WHERE 1=1`;
    let prParams = [];
    let paramCount = 1;

    // SECURITY: Non-admins only see their own PRs (by user_id OR author match)
    if (userRole !== 'admin') {
        prQuery += ` AND (user_id = $${paramCount} OR author = $${paramCount + 1})`;
        prParams.push(userId, authorUsername);
        paramCount += 2;
    } else if (authorUsername) {
        // Admin can filter by specific author
        prQuery += ` AND author = $${paramCount}`;
        prParams.push(authorUsername);
        paramCount++;
    }

    if (startDate) {
        prQuery += ` AND created_at >= $${paramCount}`;
        prParams.push(startDate);
        paramCount++;
    }
    if (endDate) {
        prQuery += ` AND created_at <= $${paramCount}`;
        prParams.push(endDate);
        paramCount++;
    }
    if (repository) {
        prQuery += ` AND repository_name = $${paramCount}`;
        prParams.push(repository);
        paramCount++;
    }

    prQuery += ` ORDER BY created_at DESC`;
    const res = await pool.query(prQuery, prParams);
    return res.rows;
};

// ── CSV EXPORT ──────────────────────────────────────────────────────────
export const exportCSV = async (req, res) => {
    try {
        console.log(`[ExportController] CSV Export requested by: ${req.user.github_username}`);
        const { employee, startDate, endDate, repository, source } = parseFilters(req.query);
        
        const activities = await getFilteredActivities(req.user.id, req.user.role, employee, startDate, endDate, repository, source);
        const prs = await getFilteredPRs(req.user.id, req.user.role, req.user.github_username, startDate, endDate, repository);

        // Build composite CSV sections
        let csvOutput = '';

        // 1. Commits Section
        csvOutput += `### COMMITS REPORT ###\n`;
        if (activities.length > 0) {
            const fields = ['employee_name', 'activity', 'repository_name', 'source', 'commit_hash', 'created_at'];
            const json2csvParser = new Parser({ fields });
            csvOutput += json2csvParser.parse(activities);
        } else {
            csvOutput += `No commit activities found.\n`;
        }

        // 2. PRs Section
        csvOutput += `\n\n### PULL REQUESTS REPORT ###\n`;
        if (prs.length > 0) {
            const fields = ['author', 'title', 'repository_name', 'state', 'merged', 'branch', 'additions', 'deletions', 'created_at'];
            const json2csvParser = new Parser({ fields });
            csvOutput += json2csvParser.parse(prs);
        } else {
            csvOutput += `No pull request activities found.\n`;
        }

        // 3. Analytics Section
        csvOutput += `\n\n### METRICS ANALYTICS ###\n`;
        const totalCommits = activities.length;
        const totalPRs = prs.length;
        const mergedPRs = prs.filter(p => p.merged).length;
        const totalAdditions = prs.reduce((sum, p) => sum + p.additions, 0);
        const totalDeletions = prs.reduce((sum, p) => sum + p.deletions, 0);

        const analyticsFields = ['metric', 'value'];
        const analyticsData = [
            { metric: 'Total Commits', value: totalCommits },
            { metric: 'Total Pull Requests', value: totalPRs },
            { metric: 'Merged Pull Requests', value: mergedPRs },
            { metric: 'Lines Added (PRs)', value: totalAdditions },
            { metric: 'Lines Deleted (PRs)', value: totalDeletions }
        ];
        const json2csvParser = new Parser({ fields: analyticsFields });
        csvOutput += json2csvParser.parse(analyticsData);

        res.header('Content-Type', 'text/csv');
        res.attachment('gitintel_engineering_report.csv');
        res.send(csvOutput);
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
        
        const activities = await getFilteredActivities(req.user.id, req.user.role, employee, startDate, endDate, repository, source);
        const prs = await getFilteredPRs(req.user.id, req.user.role, req.user.github_username, startDate, endDate, repository);

        const workbook = xlsx.utils.book_new();

        // Sheet 1: Commits
        const commitsData = activities.length > 0 ? activities.map(a => ({
            'Employee': a.employee_name,
            'Activity/Commit Message': a.activity,
            'Repository': a.repository_name || 'N/A',
            'Source': a.source,
            'Commit Hash': a.commit_hash || 'N/A',
            'Date': new Date(a.created_at).toLocaleString()
        })) : [{ 'Status': 'No commit records found' }];
        const commitsSheet = xlsx.utils.json_to_sheet(commitsData);
        xlsx.utils.book_append_sheet(workbook, commitsSheet, 'Commits');

        // Sheet 2: Pull Requests
        const prsData = prs.length > 0 ? prs.map(p => ({
            'Author': p.author,
            'PR Title': p.title,
            'Repository': p.repository_name,
            'State': p.state,
            'Merged': p.merged ? 'Yes' : 'No',
            'Source Branch': p.branch,
            'Additions': p.additions,
            'Deletions': p.deletions,
            'Files Changed': p.changed_files,
            'Created At': new Date(p.created_at).toLocaleString(),
            'Merged At': p.merged_at ? new Date(p.merged_at).toLocaleString() : 'N/A'
        })) : [{ 'Status': 'No pull request records found' }];
        const prsSheet = xlsx.utils.json_to_sheet(prsData);
        xlsx.utils.book_append_sheet(workbook, prsSheet, 'Pull Requests');

        // Sheet 3: Analytics
        const totalCommits = activities.length;
        const totalPRs = prs.length;
        const mergedPRs = prs.filter(p => p.merged).length;
        const totalAdditions = prs.reduce((sum, p) => sum + p.additions, 0);
        const totalDeletions = prs.reduce((sum, p) => sum + p.deletions, 0);

        const analyticsData = [
            { 'Metric KPI': 'Total Commit Logs', 'Value': totalCommits },
            { 'Metric KPI': 'Total Pull Requests', 'Value': totalPRs },
            { 'Metric KPI': 'Merged Pull Requests', 'Value': mergedPRs },
            { 'Metric KPI': 'PR Merge Ratio', 'Value': totalPRs ? `${Math.round((mergedPRs/totalPRs)*100)}%` : '0%' },
            { 'Metric KPI': 'Lines Added (PRs)', 'Value': totalAdditions },
            { 'Metric KPI': 'Lines Deleted (PRs)', 'Value': totalDeletions }
        ];
        const analyticsSheet = xlsx.utils.json_to_sheet(analyticsData);
        xlsx.utils.book_append_sheet(workbook, analyticsSheet, 'Analytics');

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.attachment('gitintel_engineering_report.xlsx');
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
        
        const activities = await getFilteredActivities(req.user.id, req.user.role, employee, startDate, endDate, repository, source);
        const prs = await getFilteredPRs(req.user.id, req.user.role, req.user.github_username, startDate, endDate, repository);

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        
        res.header('Content-Type', 'application/pdf');
        res.attachment('gitintel_engineering_report.pdf');
        doc.pipe(res);

        // Header / Company Title
        doc.fillColor('#4f46e5').fontSize(24).text('GitIntel Engineering Intelligence', { align: 'center' });
        doc.moveDown(0.2);
        doc.fillColor('#6b7280').fontSize(11).text('AUTOMATED PRODUCTIVITY REPORT', { align: 'center', characterSpacing: 1 });
        doc.moveDown(0.5);
        
        // Horizontal line separator
        doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(1);
        
        // Report Meta Info Grid
        doc.fillColor('#1f2937').fontSize(10);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
        doc.moveDown(0.5);
        
        doc.fontSize(11).fillColor('#111827').text('Audit Scope Details:', { bold: true });
        doc.fontSize(10).fillColor('#4b5563');
        doc.text(`• Developer / Team: ${req.user.role === 'admin' ? (employee || 'All Employees') : req.user.github_username}`);
        doc.text(`• Repository Limit: ${repository || 'All accessible repos'}`);
        doc.text(`• Event Origin Filters: ${source || 'All sources'}`);
        doc.text(`• Start Range: ${startDate ? new Date(startDate).toLocaleDateString() : 'N/A'}`);
        doc.text(`• End Range: ${endDate ? new Date(endDate).toLocaleDateString() : 'N/A'}`);
        doc.moveDown(1.5);

        // Section: Analytics Matrix
        doc.fillColor('#4f46e5').fontSize(14).text('Engineering Analytics Summary', { bold: true });
        doc.moveDown(0.5);

        const totalCommits = activities.length;
        const totalPRs = prs.length;
        const mergedPRs = prs.filter(p => p.merged).length;
        const totalAdditions = prs.reduce((sum, p) => sum + p.additions, 0);
        const totalDeletions = prs.reduce((sum, p) => sum + p.deletions, 0);

        doc.fillColor('#1f2937').fontSize(10);
        doc.text(`• Total Commit Activities Logged: ${totalCommits}`);
        doc.text(`• Total Pull Requests Created: ${totalPRs}`);
        doc.text(`• Merged Pull Requests: ${mergedPRs} (${totalPRs ? Math.round((mergedPRs/totalPRs)*100) : 0}% success rate)`);
        doc.text(`• PR Volume: +${totalAdditions} additions / -${totalDeletions} deletions across all branches.`);
        doc.moveDown(1.5);

        // Section: Commits Log
        doc.fillColor('#4f46e5').fontSize(14).text('Commit Activities Log', { bold: true });
        doc.moveDown(0.5);

        if (activities.length === 0) {
            doc.fillColor('#9ca3af').fontSize(10).text('No commit records mapped in this range.');
        } else {
            activities.slice(0, 15).forEach((act, idx) => {
                doc.fillColor('#111827').fontSize(10).text(`${idx + 1}. [${act.source.toUpperCase()}] ${act.employee_name} · ${new Date(act.created_at).toLocaleDateString()}`);
                doc.fillColor('#4b5563').fontSize(9).text(`   Repo: ${act.repository_name || 'N/A'} (SHA: ${act.commit_hash ? act.commit_hash.substring(0,7) : 'N/A'})`);
                doc.fillColor('#1f2937').fontSize(9.5).text(`   Commit: ${act.activity}`);
                doc.moveDown(0.4);
            });
            if (activities.length > 15) {
                doc.fillColor('#6b7280').fontSize(9).text(`... and ${activities.length - 15} additional commit entries logged.`);
            }
        }
        doc.moveDown(1.5);

        // Section: Pull Requests Log
        doc.fillColor('#4f46e5').fontSize(14).text('Pull Request Tracking Log', { bold: true });
        doc.moveDown(0.5);

        if (prs.length === 0) {
            doc.fillColor('#9ca3af').fontSize(10).text('No pull request records registered.');
        } else {
            prs.slice(0, 10).forEach((pr, idx) => {
                doc.fillColor('#111827').fontSize(10).text(`${idx + 1}. ${pr.title} (${pr.state.toUpperCase()}) · ${new Date(pr.created_at).toLocaleDateString()}`);
                doc.fillColor('#4b5563').fontSize(9).text(`   Repo: ${pr.repository_name} · Branch: ${pr.branch} · Merged: ${pr.merged ? 'Yes' : 'No'}`);
                doc.fillColor('#1f2937').fontSize(9).text(`   Author: @${pr.author} · Changes: +${pr.additions} / -${pr.deletions} (${pr.changed_files} files)`);
                doc.moveDown(0.4);
            });
            if (prs.length > 10) {
                doc.fillColor('#6b7280').fontSize(9).text(`... and ${prs.length - 10} additional pull request records logged.`);
            }
        }

        doc.end();
        console.log('[ExportController] PDF Export successful.');
    } catch (error) {
        console.error('[ExportController] PDF Export Error:', error);
        res.status(500).json({ message: 'Failed to generate PDF' });
    }
};

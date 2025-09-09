const express = require("express");
const path = require("path");
const multer = require("multer");
const ExcelJS = require("exceljs");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const fontkit = require('@pdf-lib/fontkit');
const AWS = require('aws-sdk');
const nodemailer = require("nodemailer");
const fs = require("fs");
require('dotenv').config();

// Initialize Express
const app = express();
const PORT = 3000;

// Configure AWS
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

// Initialize S3
const s3 = new AWS.S3();

// Configure email
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Multer middleware
const upload = multer();

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "IBS_checklist.html"));
});

// Form submission endpoint
app.post("/submit", upload.none(), async (req, res) => {
    try {
        const formData = req.body;
        console.log("Processing form submission:", formData);

        // Create new workbook
        const workbook = new ExcelJS.Workbook();
        const excelKey = 'submissions/IBS_submissions.xlsx';

        try {
            // Try to get existing Excel from S3
            console.log('Fetching existing Excel from S3...');
            const data = await s3.getObject({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: excelKey
            }).promise();
            
            await workbook.xlsx.load(data.Body);
            console.log('Successfully loaded existing Excel from S3');
        } catch (err) {
            console.log('No existing Excel found, creating new one');
        }

        // Get or create worksheet
        let sheet = workbook.getWorksheet("Submissions");
        if (!sheet) {
            sheet = workbook.addWorksheet("Submissions");
            sheet.addRow(["Timestamp", "Name", "Age", "Sex", "Phone", "Email", "Selections"]);
        }

        // Add new row
        sheet.addRow([
            new Date().toLocaleString(),
            formData.name,
            formData.age,
            formData.sex,
            formData.phone,
            formData.email,
            JSON.stringify(formData)
        ]);

        // Generate Excel buffer
        const excelBuffer = await workbook.xlsx.writeBuffer();

        // Upload to S3
        console.log('Uploading Excel to S3...');
        const uploadResult = await s3.upload({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: excelKey,
            Body: excelBuffer,
            ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }).promise();

        console.log('Excel uploaded successfully:', uploadResult.Location);

        // Save local backup
        const backupDir = path.join(__dirname, 'excel');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        await workbook.xlsx.writeFile(path.join(backupDir, 'IBS_submissions.xlsx'));

        // Return success response
        res.json({
            success: true,
            message: "Form submitted and Excel updated successfully",
            excelLocation: uploadResult.Location
        });

    } catch (error) {
        console.error('Error processing submission:', error);
        res.status(500).json({
            success: false,
            message: "Error processing submission",
            error: error.message
        });
    }
});

// Excel download endpoint
app.get('/download-excel/:filename', async (req, res) => {
    const key = `submissions/${req.params.filename}`;
    
    try {
        const data = await s3.getObject({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key
        }).promise();

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
        res.send(data.Body);
    } catch (error) {
        console.error('Error downloading Excel:', error);
        
        // Try local backup
        const localPath = path.join(__dirname, 'excel', req.params.filename);
        if (fs.existsSync(localPath)) {
            res.download(localPath);
        } else {
            res.status(404).json({ error: 'Excel file not found' });
        }
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});

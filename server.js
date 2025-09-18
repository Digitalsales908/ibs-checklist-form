const express = require("express");
const path = require("path");
const multer = require("multer");
const ExcelJS = require("exceljs");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const fontkit = require('@pdf-lib/fontkit');
const AWS = require('aws-sdk');
require('dotenv').config();
const fs = require("fs");
// const nodemailer = require("nodemailer");
const axios = require("axios");


const app = express();
const PORT = 3000;

// Configure AWS S3
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

const s3 = new AWS.S3();

// Email configuration
// const transporter = nodemailer.createTransport({
//     host: process.env.SMTP_HOST || 'smtp.gmail.com',
//     port: process.env.SMTP_PORT || 587,
//     secure: false,
//     auth: {
//         user: process.env.EMAIL_USER,
//         pass: process.env.EMAIL_PASS
//     }
// });

// Function to upload Excel file to S3
const uploadExcelToS3 = async (workbook) => {
    const excelBuffer = await workbook.xlsx.writeBuffer();
    const timestamp = Date.now();
    const excelFileName = `IBS_submissions_${timestamp}.xlsx`;

    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `excel/${excelFileName}`,
        Body: excelBuffer,
        ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };

    try {
        const result = await s3.upload(params).promise();
        return {
            url: result.Location,
            fileName: excelFileName
        };
    } catch (error) {
        console.error('Error uploading Excel to S3:', error);
        throw error;
    }
};

// Function to get Excel file from S3
const getExcelFromS3 = async (fileName) => {
    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `excel/${fileName}`
    };

    try {
        const response = await s3.getObject(params).promise();
        return response.Body;
    } catch (error) {
        console.error('Error getting Excel from S3:', error);
        throw error;
    }
};

// Function to send email with PDF attachment
// const sendEmailWithPDF = async (recipientEmail, pdfBuffer, formData) => {
//     // Use the exact value submitted by the form
//     const completionPercentage = parseInt(formData.completionPercentage || formData.overallPercentage || 0, 10);
//     const riskLevel = determineRiskLevel(Number(completionPercentage)); // For risk logic only

//     const mailOptions = {
//         from: `"Progenics Medical Center" <${process.env.EMAIL_USER}>`,
//         to: recipientEmail,
//         subject: 'Your IBS Assessment Results - Progenics Laboratories Private Limited',
//         html: `
//             <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//                 <h2 style="color: #2c3e50;">IBS Assessment Results</h2>
//                 <p>Dear ${formData.name},</p>
//                 <p>Thank you for completing your IBS assessment with Progenics Laboratories Private Limited. We have attached your detailed assessment results in PDF format.</p>
                
//                 <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
//                     <h3 style="margin-top: 0;">Assessment Summary</h3>
//                     <p><strong>Completion:</strong> ${completionPercentage}%</p>
//                     <p><strong>Risk Level:</strong> <span style="color: ${
//                         riskLevel === 'high' ? '#dc3545' : 
//                         riskLevel === 'moderate' ? '#ffc107' : '#28a745'
//                     }; font-weight: bold;">${riskLevel.toUpperCase()}</span></p>
//                 </div>
//             </div>
//         `,
//         attachments: [{
//             filename: `IBS_Assessment_${formData.name}_${new Date().toISOString().split('T')[0]}.pdf`,
//             content: pdfBuffer
//         }]
//     };

//     return transporter.sendMail(mailOptions);
// };
const sendEmailWithPDF = async (recipientEmail, pdfBuffer, formData) => {
    const completionPercentage = parseFloat(
        formData.completionPercentage || formData.overallPercentage || 0
    );
    const riskLevel = determineRiskLevel(completionPercentage);

    // ✅ Ensure it's a Buffer
    const safeBuffer = Buffer.isBuffer(pdfBuffer) 
        ? pdfBuffer 
        : Buffer.from(pdfBuffer);

    // ✅ Convert to Base64
    const pdfBase64 = safeBuffer.toString("base64");

    const payload = {
        name: formData.name,
        email: recipientEmail,
        completionPercentage,
        riskLevel,
        pdfBase64
    };

    try {
        const response = await axios.post(
            process.env.POWER_AUTOMATE_FLOW_URL,
            payload,
            { headers: { "Content-Type": "application/json" } }
        );

        console.log("✅ Sent to Power Automate:", response.status);
    } catch (error) {
        console.error("❌ Power Automate error:", error.response?.data || error.message);
        throw error;
    }
};


// Utility function to upload file to S3
const uploadToS3 = async (fileBuffer, fileName) => {
    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `pdfs/${fileName}`,
        Body: fileBuffer,
        ContentType: 'application/pdf'
    };

    try {
        const result = await s3.upload(params).promise();
        return result.Location;
    } catch (error) {
        console.error('Error uploading to S3:', error);
        throw error;
    }
};

// Multer middleware (parse text fields only)
const upload = multer();

// Public folder for frontend assets (JS, CSS, index.html)
app.use(express.static(path.join(__dirname, "public")));

// Serve index.html on root
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "IBS_checklist.html"));
});

// Private PDF folder (not exposed to clients)
const pdfDir = path.join(__dirname, "pdfs");
if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir);

// Section mapping
const sectionTitles = {
    "sec-1": "1. How to Define IBS",
    "sec-2": "2. Pathophysiology",
    "sec-3": "3. Confident Diagnosis",
    "sec-4": "4. Warning Signs"
};

// Checkbox options (hardcoded with labels)
const checkboxOptions = {
    "sec-1": [
        "Recurrent abdominal pain (>1 day/week in the last 3 months)",
        "Bloating or abdominal distension",
        "Change in bowel frequency and stool form/shape"
    ],
    "sec-2": [
        "Stress or anxiety",
        "Abnormal pain signaling",
        "Visceral hypersensitivity",
        "Dysregulated gut motility",
        "Microbiota disturbance",
        "Gut Inflammation",
        "Gas production/bloating",
        "Dietary trigger"
    ],
    "sec-3": [
        "Symptoms > 6 months in duration",
        "Abdominal pain >1 day/week",
        "Pain related to defecation",
        "Type 1: Separate hard lumps, like nuts",
        "Type 2: Lumpy and sausage-shaped",
        "Type 3: Like a sausage with cracks",
        "Type 4: Smooth, soft sausage or snake",
        "Type 5: Soft blobs with clear-cut edges",
        "Type 6: Mushy with ragged edges",
        "Type 7: Watery, no solid pieces"
    ],
    "sec-4": [
        "Blood in stool",
        "Anemia or low hemoglobin",
        "Abdominal mass",
        "Fecal Incontinence",
        "Weight loss",
        "Fever",
        "Nocturnal symptoms",
        "Family history of IBD, celiac, colorectal cancer",
        "New symptom onset (<6 months)",
        "Recent antibiotic use",
        "Extra-intestinal signs (rash, arthritis, eye Inflammation)"
    ]
};

// Function to calculate overall completion percentage
const calculateCompletionPercentage = (formData) => {
    let totalOptions = 0;
    let selectedOptions = 0;
    
    for (const secKey of Object.keys(checkboxOptions)) {
        totalOptions += checkboxOptions[secKey].length;
        if (formData[secKey]) {
            selectedOptions += Array.isArray(formData[secKey]) ? formData[secKey].length : 1;
        }
    }

    // Use Math.round instead of Math.floor
    return totalOptions > 0 
        ? Math.round((selectedOptions / totalOptions) * 100) 
        : 0;
};

// // Function to determine risk level based on selections
// const determineRiskLevel = (formData) => {
//     // Count warning signs (section 4)
//     const warningSigns = formData["sec-4"] 
//         ? (Array.isArray(formData["sec-4"]) ? formData["sec-4"].length : 1)
//         : 0;
    
//     // Count pathophysiology factors (section 2)
//     const pathophysiologyFactors = formData["sec-2"]
//         ? (Array.isArray(formData["sec-2"]) ? formData["sec-2"].length : 1)
//         : 0;
    
//     // Simple risk assessment logic
//     if (warningSigns >= 3) {
//         return "high";
//     } else if (warningSigns >= 1 || pathophysiologyFactors >= 4) {
//         return "moderate";
//     } else {
//         return "low";
//     }
// };
function determineRiskLevel(completionPercentage) {
    if (completionPercentage >= 41) return "high";
    if (completionPercentage >= 21) return "moderate";
    if (completionPercentage >= 1) return "low";
    return "low"; // fallback for 0
}
// Function to get risk message based on risk level
const getRiskMessage = (riskLevel) => {
    switch (riskLevel) {
        case "high":
            return "RED ALERT! You have high-risk IBS symptoms with active inflammation. A personalized gut microbiome test with restrictive diet focusing on easily digestible foods is essential. Connect with Progenics team for optimal care and management.";
        case "moderate":
            return "You have moderate-risk IBS symptoms with noticeable inflammation. A personalized gut microbiome test with carefully planned diet of easily digestible foods is recommended. Connect with the Progenics team for better management and nutritional support.";
        default:
            return "You have low-risk IBS symptoms with no active inflammation. A diet of easily digestible foods is recommended, while avoiding known triggers. For optimal management, contact the Progenics team.";
    }
};

app.post("/submit", upload.none(), async (req, res) => {
    try {
        const formData = req.body;
        console.log("Incoming form data:", formData);

        // Function to replace special characters in text
        const replaceSpecialChars = (text) => {
            if (typeof text === 'string') {
                return text.replace(/≥/g, '>=');
            }
            return text;
        };

        // Process form data to replace special characters
        for (const section in formData) {
            if (Array.isArray(formData[section])) {
                formData[section] = formData[section].map(replaceSpecialChars);
            } else {
                formData[section] = replaceSpecialChars(formData[section]);
            }
        }

        // Calculate assessment results
        const completionPercentage = parseFloat(req.body.overallPercentage) || 0; // exact form value
        const riskLevel = determineRiskLevel(completionPercentage);
        const riskMessage = getRiskMessage(riskLevel);

        // Handle Excel
        const workbook = new ExcelJS.Workbook();
        const excelFileName = 'submissions/IBS_submissions.xlsx';

        try {
            // Try to get existing Excel file from S3
            console.log('Fetching existing Excel from S3...');
            const excelData = await s3.getObject({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: excelFileName
            }).promise();
            
            await workbook.xlsx.load(excelData.Body);
            console.log('Successfully loaded existing Excel from S3');
        } catch (error) {
            console.log('Creating new Excel file as none exists in S3');
        }

        // Create column headers for all possible fields
        const baseHeaders = ["Timestamp", "Name", "Age", "Sex", "Phone", "Email", "Completion%", "RiskLevel"];
        const allHeaders = [...baseHeaders];

        // Add all checkbox options as column headers
        Object.values(checkboxOptions).forEach(sectionOptions => {
            sectionOptions.forEach(option => {
                allHeaders.push(option);
            });
        });

        // Get or create worksheet
        let sheet = workbook.getWorksheet("Submissions");
        if (!sheet) {
            sheet = workbook.addWorksheet("Submissions");
            sheet.addRow(allHeaders);
        }

        // Prepare row data with base information
        const rowData = [
            new Date().toLocaleString(),
            formData.name,
            formData.age,
            formData.sex,
            formData.phone,
            formData.email,
            completionPercentage,
            riskLevel.toUpperCase()
        ];

        // Add checkbox selections (Yes/No for each option)
        Object.values(checkboxOptions).forEach(sectionOptions => {
            sectionOptions.forEach(option => {
                // Check if this option was selected in the form data
                let isSelected = false;
                
                // Check all sections for this selection
                for (const sectionKey of Object.keys(sectionTitles)) {
                    if (formData[sectionKey]) {
                        const selections = Array.isArray(formData[sectionKey]) 
                            ? formData[sectionKey] 
                            : [formData[sectionKey]];
                            
                        if (selections.includes(option)) {
                            isSelected = true;
                            break;
                        }
                    }
                }
                
                rowData.push(isSelected ? "Yes" : "No");
            });
        });

        // Add the complete row
        sheet.addRow(rowData);

        // Save Excel to S3
        const excelBuffer = await workbook.xlsx.writeBuffer();
        
        const uploadResult = await s3.upload({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: excelFileName,
            Body: excelBuffer,
            ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }).promise();
        
        console.log('Excel file uploaded to:', uploadResult.Location);

        // Save local backup
        const localExcelDir = path.join(__dirname, 'excel');
        if (!fs.existsSync(localExcelDir)) {
            fs.mkdirSync(localExcelDir, { recursive: true });
        }
        const localExcelPath = path.join(localExcelDir, 'IBS_submissions.xlsx');
        await workbook.xlsx.writeFile(localExcelPath);
        console.log('Local backup saved:', localExcelPath);

        // --- PDF saving with actual checkboxes ---
        const timestamp = Date.now();
        const pdfFileName = `IBS_${timestamp}.pdf`;
        const pdfPath = path.join(pdfDir, pdfFileName);

        // Create a new PDFDocument
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([595, 842]); // A4 size - single page

        // Register fontkit for custom font support
        pdfDoc.registerFontkit(fontkit);

        // Load Roboto fonts
        let robotoRegular, robotoBold, robotoItalic;

        try {
            const robotoRegularPath = path.join(__dirname, 'fonts', 'Roboto-Regular.ttf');
            const robotoRegularBytes = fs.readFileSync(robotoRegularPath);
            robotoRegular = await pdfDoc.embedFont(robotoRegularBytes);

            const robotoBoldPath = path.join(__dirname, 'fonts', 'Roboto-Bold.ttf');
            const robotoBoldBytes = fs.readFileSync(robotoBoldPath);
            robotoBold = await pdfDoc.embedFont(robotoBoldBytes);

            const robotoItalicPath = path.join(__dirname, 'fonts', 'Roboto-Italic.ttf');
            const robotoItalicBytes = fs.readFileSync(robotoItalicPath);
            robotoItalic = await pdfDoc.embedFont(robotoItalicBytes);

            console.log('Roboto fonts loaded successfully');
        } catch (error) {
            console.error('Error loading Roboto fonts:', error);
            robotoRegular = pdfDoc.embedStandardFont(StandardFonts.Helvetica);
            robotoBold = pdfDoc.embedStandardFont(StandardFonts.HelveticaBold);
            robotoItalic = pdfDoc.embedStandardFont(StandardFonts.HelveticaOblique);
            console.log('Using fallback Helvetica fonts');
        }

        let yPosition = 820; // Start near the top of the page

        // ✅ Load and embed logos properly
        let logo1, logo2;
        let logo1Dims, logo2Dims;
        try {
            const logo1Bytes = fs.readFileSync(path.join(__dirname, 'public', 'Images', 'Blue logo progenics.png'));
            logo1 = await pdfDoc.embedPng(logo1Bytes);
            logo1Dims = logo1.scale(0.12);

            const logo2Bytes = fs.readFileSync(path.join(__dirname, 'public', 'Images', 'Gut Genics logo.png'));
            logo2 = await pdfDoc.embedPng(logo2Bytes);
            logo2Dims = logo2.scale(0.12);

            console.log("Logos embedded successfully");
        } catch (error) {
            console.error("Error embedding logos:", error);
        }

        // Draw logos and title
        const logoHeight = 30;
        let logo1Width = 0;
        let logo2Width = 0;

        if (logo1 && logo2 && logo1Dims && logo2Dims) {
            logo1Width = (logo1Dims.width / logo1Dims.height) * logoHeight;
            logo2Width = (logo2Dims.width / logo2Dims.height) * logoHeight;

            const logo1X = 50;
            const logo2X = 595 - logo2Width - 50;

            page.drawImage(logo1, {
                x: logo1X,
                y: yPosition - logoHeight,
                width: logo1Width,
                height: logoHeight
            });

            page.drawImage(logo2, {
                x: logo2X,
                y: yPosition - logoHeight,
                width: logo2Width,
                height: logoHeight
            });

            const headingText = "IBS DIAGNOSIS CHECKLIST";
            page.drawText(headingText, {
                x: (595 - headingText.length * 7) / 2,
                y: yPosition - 25,
                size: 14,
                font: robotoBold,
                color: rgb(0.2, 0.4, 0.6)
            });
            yPosition = yPosition - logoHeight - 40;
        } else {
            const headingText = "IBS DIAGNOSIS CHECKLIST";
            page.drawText(headingText, {
                x: (595 - headingText.length * 7) / 2,
                y: yPosition - 25,
                size: 14,
                font: robotoBold,
                color: rgb(0.2, 0.4, 0.6)
            });
            yPosition -= 40;
        }

        // Patient Info Box
        page.drawRectangle({
            x: 40,
            y: yPosition - 60,
            width: 515,
            height: 50,
            color: rgb(0.95, 0.95, 0.95),
            borderColor: rgb(0.7, 0.7, 0.7),
            borderWidth: 1,
        });

        page.drawText("PATIENT INFORMATION", {
            x: 50,
            y: yPosition - 20,
            size: 10,
            font: robotoBold,
            color: rgb(0.2, 0.2, 0.2)
        });

        // Patient Info in two columns
        page.drawText(`Name: ${formData.name || "Not provided"}`, {
            x: 50,
            y: yPosition - 35,
            size: 9,
            font: robotoRegular,
        });

        page.drawText(`Age: ${formData.age || "Not provided"}`, {
            x: 50,
            y: yPosition - 45,
            size: 9,
            font: robotoRegular,
        });

        page.drawText(`Sex: ${formData.sex || "Not provided"}`, {
            x: 50,
            y: yPosition - 55,
            size: 9,
            font: robotoRegular,
        });

        page.drawText(`Phone: ${formData.phone || "Not provided"}`, {
            x: 250,
            y: yPosition - 35,
            size: 9,
            font: robotoRegular,
        });

        page.drawText(`Email: ${formData.email || "Not provided"}`, {
            x: 250,
            y: yPosition - 45,
            size: 9,
            font: robotoRegular,
        });

        page.drawText(`Date: ${new Date().toLocaleDateString()}`, {
            x: 250,
            y: yPosition - 55,
            size: 9,
            font: robotoRegular,
        });

        yPosition -= 100;

        // Loop over each section
        // for (const secKey of Object.keys(sectionTitles)) {
        //     // Section title with background
        //     page.drawRectangle({
        //         x: 40,
        //         y: yPosition - 15,
        //         width: 515,
        //         height: 20,
        //         color: rgb(0.2, 0.4, 0.6),
        //     });

        //     page.drawText(sectionTitles[secKey], {
        //         x: 50,
        //         y: yPosition - 10,
        //         size: 9,
        //         font: robotoBold,
        //         color: rgb(1, 1, 1)
        //     });

        //     yPosition -= 28;
            
        //     // User's selections
        //     const selected = formData[secKey]
        //         ? Array.isArray(formData[secKey]) ? formData[secKey] : [formData[secKey]]
        //         : [];
            
        //     // Create checkboxes in horizontal layout
        //     const options = checkboxOptions[secKey];
        //     const columnCount = 3;
            
        //     // Calculate column width to ensure proper spacing
        //     const columnWidth = 515 / columnCount;
        //     const checkboxWidth = 10;
        //     const textPadding = 5;
            
        //     for (let i = 0; i < options.length; i++) {
        //         const label = options[i];
        //         const isChecked = selected.includes(label);
                
        //         // Determine column and row position
        //         const column = i % columnCount;
        //         const row = Math.floor(i / columnCount);
                
        //         // Calculate x position with proper spacing
        //         const xPosition = 50 + (column * columnWidth);
                
        //         // Create a checkbox
        //         const fieldName = `${secKey}-${label.substring(0, 20).replace(/\s+/g, '-')}-${i}`;
        //         const form = pdfDoc.getForm();
        //         const checkbox = form.createCheckBox(fieldName);
        //         checkbox.addToPage(page, {
        //             x: xPosition,
        //             y: yPosition - (row * 15) - 2,
        //             width: checkboxWidth,
        //             height: 10,
        //             borderColor: rgb(0.2, 0.4, 0.6),
        //             backgroundColor: rgb(0.95, 0.95, 0.95),
        //         });
                
        //         // Check if selected
        //         if (isChecked) {
        //             checkbox.check();
        //         }
                
        //         // Calculate maximum text width based on column width
        //         const maxTextWidth = columnWidth - checkboxWidth - textPadding - 10;
                
        //         // Add label text
        //         page.drawText(label, {
        //             x: xPosition + checkboxWidth + textPadding,
        //             y: yPosition - (row * 15),
        //             size: 9,
        //             font: robotoRegular,
        //             maxWidth: maxTextWidth,
        //             lineHeight: 10,
        //         });
        //     }
            
        //     const longestColumn = Math.ceil(options.length / columnCount);

        //     // Use consistent base spacing for all sections
        //     const baseRowHeight = 20;
        //     const baseSectionPadding = 20;

        //     // Apply the same spacing formula to all sections
        //     let sectionSpacing = (longestColumn * baseRowHeight) + baseSectionPadding;

        //     // Apply the spacing
        //     yPosition -= sectionSpacing;
        // }
        for (const secKey of Object.keys(sectionTitles)) {
            // Section title with background
            page.drawRectangle({
                x: 40,
                y: yPosition - 15,
                width: 515,
                height: 20,
                color: rgb(0.2, 0.4, 0.6),
            });

            page.drawText(sectionTitles[secKey], {
                x: 50,
                y: yPosition - 10,
                size: 9,
                font: robotoBold,
                color: rgb(1, 1, 1)
            });

            yPosition -= 28;
            
            // User's selections
            const selected = formData[secKey]
                ? Array.isArray(formData[secKey]) ? formData[secKey] : [formData[secKey]]
                : [];
            
            // Create checkboxes in horizontal layout
            const options = checkboxOptions[secKey];
            const columnCount = 3;
            
            // Calculate column width to ensure proper spacing
            const columnWidth = 515 / columnCount;
            const checkboxWidth = 10;
            const textPadding = 5;
            
            // Track row heights for this section
            const rowHeights = [];
            
            for (let i = 0; i < options.length; i++) {
                const label = options[i];
                const isChecked = selected.includes(label);
                
                // Determine column and row position
                const column = i % columnCount;
                const row = Math.floor(i / columnCount);
                
                // Calculate x position with proper spacing
                const xPosition = 50 + (column * columnWidth);
                
                // Calculate maximum text width based on column width
                const maxTextWidth = columnWidth - checkboxWidth - textPadding - 10;
                
                // Calculate how many lines this label will need
                const labelLines = wrapText(label, maxTextWidth, 9);
                const lineCount = labelLines.length;
                const itemHeight = Math.max(15, lineCount * 10); // At least 15 units, or more for multi-line labels
                
                // Create a checkbox
                const fieldName = `${secKey}-${label.substring(0, 20).replace(/\s+/g, '-')}-${i}`;
                const form = pdfDoc.getForm();
                const checkbox = form.createCheckBox(fieldName);
                checkbox.addToPage(page, {
                    x: xPosition,
                    y: yPosition - (row * 20) - 2, // Increased row spacing to 20
                    width: checkboxWidth,
                    height: 10,
                    borderColor: rgb(0.2, 0.4, 0.6),
                    backgroundColor: rgb(0.95, 0.95, 0.95),
                });
                
                // Check if selected
                if (isChecked) {
                    checkbox.check();
                }
                
                // Add label text - handle multi-line labels
                let textY = yPosition - (row * 20) + 2; // Position text slightly lower
                
                for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
                    page.drawText(labelLines[lineIndex], {
                        x: xPosition + checkboxWidth + textPadding,
                        y: textY - (lineIndex * 10), // Move up for each additional line
                        size: 9,
                        font: robotoRegular,
                        maxWidth: maxTextWidth,
                    });
                }
                
                // Track the maximum height needed for this row across all columns
                if (!rowHeights[row]) {
                    rowHeights[row] = itemHeight;
                } else {
                    rowHeights[row] = Math.max(rowHeights[row], itemHeight);
                }
            }
            
            // Adjust yPosition based on the actual row heights
            let totalHeight = 0;
            for (let row = 0; row < rowHeights.length; row++) {
                totalHeight += rowHeights[row] + 2; // Add 5 units of padding between rows
            }

            // Use consistent base spacing for all sections
            const baseSectionPadding = 25;

            // Apply the spacing
            yPosition -= totalHeight + baseSectionPadding;
        }
        // ===== ASSESSMENT RESULTS SECTION AT THE END =====
        if (yPosition < 150) {
            yPosition = 150;
        }

        // // Section box
        // page.drawRectangle({
        //     x: 40,
        //     y: yPosition - 90,
        //     width: 515,
        //     height: 80,
        //     color: rgb(0.95, 0.95, 0.95),
        //     borderColor: rgb(0.7, 0.7, 0.7),
        //     borderWidth: 1,
        // });

        // page.drawText("ASSESSMENT RESULTS", {
        //     x: 50,
        //     y: yPosition - 25,
        //     size: 11,
        //     font: robotoBold,
        //     color: rgb(0.2, 0.2, 0.2)
        // });

        // // Risk level with color coding
        // let riskColor;
        // switch (riskLevel) {
        //     case "high":
        //         riskColor = rgb(1, 0, 0);
        //         break;
        //     case "moderate":
        //         riskColor = rgb(0.9, 0.6, 0);
        //         break;
        //     default:
        //         riskColor = rgb(0.1, 0.6, 0.2);
        // }

        // page.drawText(`Risk Level: ${riskLevel.toUpperCase()}`, {
        //     x: 50,
        //     y: yPosition - 40,
        //     size: 10,
        //     font: robotoBold,
        //     color: riskColor
        // });

        // // Risk message with proper formatting
        // page.drawText("Assessment:", {
        //     x: 50,
        //     y: yPosition - 55,
        //     size: 9,
        //     font: robotoBold,
        //     color: rgb(0.2, 0.2, 0.2)
        // });

        // Wrap the risk message properly with consistent line spacing
       // Calculate required height for assessment section
        // Calculate space needed for assessment section
        const riskMessageLines = wrapText(riskMessage, 550, 9);
        const assessmentHeight = 70 + (riskMessageLines.length * 11); // Reduced height

        // Section box - more compact design
        page.drawRectangle({
            x: 40,
            y: yPosition - assessmentHeight,
            width: 515,
            height: assessmentHeight,
            color: rgb(0.95, 0.95, 0.95),
            borderColor: rgb(0.7, 0.7, 0.7),
            borderWidth: 1,
        });

        // Compact assessment layout
        page.drawText("ASSESSMENT RESULTS", {
            x: 50,
            y: yPosition - 18, // Moved up
            size: 10, // Smaller font
            font: robotoBold,
            color: rgb(0.2, 0.2, 0.2)
        });

        // Risk level with color coding - compact placement
        let riskColor;
        switch (riskLevel) {
            case "high":
                riskColor = rgb(1, 0, 0);
                break;
            case "moderate":
                riskColor = rgb(0.9, 0.6, 0);
                break;
            default:
                riskColor = rgb(0.1, 0.6, 0.2);
        }

        page.drawText(`Risk Level: ${riskLevel.toUpperCase()}`, {
            x: 50,
            y: yPosition - 32, // Moved up
            size: 9, // Smaller font
            font: robotoBold,
            color: riskColor
        });

        // Compact assessment label
        page.drawText("Assessment:", {
            x: 50,
            y: yPosition - 45, // Moved up
            size: 8, // Smaller font
            font: robotoBold,
            color: rgb(0.2, 0.2, 0.2)
        });

        // Draw the wrapped risk message with tighter spacing
        riskMessageLines.forEach((line, index) => {
            page.drawText(line, {
                x: 50,
                y: yPosition - 58 - (index * 10), // Reduced from 11 to 10, moved up
                size: 9,
                font: robotoRegular,
                color: rgb(0.2, 0.2, 0.2)
            });
        });

        yPosition -= (assessmentHeight + 10); // Reduced spacing

        // ===== DISCLAIMER SECTION =====
        // Draw a separator line closer to assessment box
        page.drawLine({
            start: { x: 40, y: yPosition },
            end: { x: 555, y: yPosition },
            thickness: 1,
            color: rgb(0.7, 0.7, 0.7),
        });

        yPosition -= 12; // Reduced spacing

        const disclaimerText = "Disclaimer: This tool is for educational purposes only and is not a medical diagnosis. Always consult a healthcare professional for any health concerns or symptoms. The final diagnosis must be made by a qualified clinician.";

        // Draw disclaimer text with tighter spacing
        const disclaimerLines = wrapText(disclaimerText, 620, 8);
        disclaimerLines.forEach((line, index) => {
            page.drawText(line, {
                x: 50,
                y: yPosition - (index * 9), // Reduced from 10 to 9
                size: 7, // Smaller font
                font: robotoItalic,
                color: rgb(0.5, 0.5, 0.5)
            });
        });

        yPosition -= (disclaimerLines.length * 9 + 20); // Reduced spacing

        // ===== FOOTER WITH CONTACT INFO =====
        // Ensure footer is at proper position
        const footerY = Math.max(30, yPosition);

        // Left side: Email
        page.drawText("connect@progenicslabs.com", {
            x: 50,
            y: footerY,
            size: 8, // Smaller font
            font: robotoItalic,
            color: rgb(0.5, 0.5, 0.5)
        });

        // Right side: Website
        const websiteText = "www.progenicslabs.com";
        const websiteWidth = websiteText.length * 4.5; // Adjusted for smaller font
        page.drawText(websiteText, {
            x: 595 - websiteWidth - 50,
            y: footerY,
            size: 8, // Smaller font
            font: robotoItalic,
            color: rgb(0.5, 0.5, 0.5)
        });
        // Save the PDF
        const pdfBytes = await pdfDoc.save();
        // Save locally
        const pdfBuffer = Buffer.from(pdfBytes);   // ✅ ensure binary
        fs.writeFileSync(pdfPath, pdfBuffer);      // ✅ correct way to save


       try {
            // Upload to S3
            const s3Url = await uploadToS3(pdfBuffer, pdfFileName);
            
            // Send email with PDF attachment
            try {
                await sendEmailWithPDF(formData.email, pdfBuffer, formData);
                console.log('Email sent successfully to:', formData.email);
            } catch (emailError) {
                console.error('Error sending email:', emailError);
            }

            res.json({ 
                success: true, 
                message: "Form submitted successfully and email sent", 
                pdfUrl: s3Url,
                localPath: pdfPath,
                completionPercentage,
                riskLevel
            });

        } catch (uploadError) {
            console.error("Error uploading PDF or sending response:", uploadError);
            res.status(500).json({ success: false, message: "Upload failed: " + uploadError.message });
        }  // <-- THIS was missing in your code
    } catch (error) {
        console.error("Error processing form:", error);
        res.status(500).json({ success: false, message: "Error processing form: " + error.message });
    }
});

// Helper function to wrap text and calculate lines
function wrapText(text, maxWidth, fontSize) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    
    // More accurate width calculation
    // Average character width varies by font, but this is a better estimate
    const avgCharWidth = fontSize * 0.5;
    const maxChars = Math.floor(maxWidth / avgCharWidth);
    
    for (let i = 0; i < words.length; i++) {
        const testLine = currentLine ? `${currentLine} ${words[i]}` : words[i];
        
        // Check if adding this word would exceed the max width
        if (testLine.length <= maxChars) {
            currentLine = testLine;
        } else {
            // If currentLine is empty, force add the word (it's too long)
            if (!currentLine) {
                lines.push(words[i]);
                continue;
            }
            
            lines.push(currentLine);
            currentLine = words[i];
        }
    }
    
    if (currentLine) {
        lines.push(currentLine);
    }
    
    return lines;
}
// Helper function to wrap text
function wrapText1(text, maxLineLength) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
        if ((currentLine + word).length > maxLineLength && currentLine.length > 0) {
            lines.push(currentLine.trim());
            currentLine = word + ' ';
        } else {
            currentLine += word + ' ';
        }
    });
    
    if (currentLine) {
        lines.push(currentLine.trim());
    }
    
    return lines;
}

// Route to get PDF from S3
app.get('/pdf/:filename', async (req, res) => {
    const filename = req.params.filename;
    
    try {
        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `pdfs/${filename}`
        };

        // Get the file from S3
        const s3File = await s3.getObject(params).promise();
        
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        
        // Send the PDF file
        res.send(s3File.Body);
    } catch (error) {
        console.error('Error fetching from S3:', error);
        
        // Try to serve local file as fallback
        const localPath = path.join(__dirname, 'pdfs', filename);
        if (fs.existsSync(localPath)) {
            res.sendFile(localPath);
        } else {
            res.status(404).json({ error: 'PDF not found' });
        }
    }
});

// Route to download Excel file
app.get('/download-excel/:filename', async (req, res) => {
    const filename = req.params.filename;
    
    try {
        // Get Excel file from S3
        const excelBuffer = await getExcelFromS3(filename);
        
        // Set headers for Excel download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        // Send the Excel file
        res.send(excelBuffer);
    } catch (error) {
        console.error('Error downloading Excel:', error);
        
        // Try to serve local file as fallback
        const localPath = path.join(__dirname, 'excel', filename);
        if (fs.existsSync(localPath)) {
            res.download(localPath);
        } else {
            res.status(404).json({ error: 'Excel file not found' });
        }
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});


// ==================== KEEP ALIVE SCRIPT ====================
const url = process.env.RENDER_EXTERNAL_URL || "https://ibs-checklist-form.onrender.com"; 

function keepAlive() {
    setInterval(async () => {
        try {
            const response = await fetch(url);
            console.log(`[KeepAlive] Pinged ${url} - Status: ${response.status}`);
        } catch (err) {
            console.error("[KeepAlive] Error pinging server:", err.message);
        }
    }, 3 * 60 * 1000); // every 3 minutes
}

keepAlive();
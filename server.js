const express = require("express");
const path = require("path");
const multer = require("multer");
const ExcelJS = require("exceljs");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const fontkit = require('@pdf-lib/fontkit');
const AWS = require('aws-sdk');
require('dotenv').config();
const fs = require("fs");

const app = express();
const PORT = 3000;

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
    "Change in bowel frequency and stool form and shape"
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
    "Type 1: Separate hard lumps, like nuts (hard to pass)",
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
    "Family history of IBD, celiac, cancer",
    "New symptom onset (<6 months)",
    "Recent antibiotic use",
    "Extra-intestinal signs (rash, arthritis, eye Inflammation)"
  ]
};


// AWS S3 configuration
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

// Utility function to upload file to S3
const uploadToS3 = async (fileBuffer, fileName) => {
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME, // Fixed: Added missing closing bracket
    Key: `pdfs/${fileName}`,
    Body: fileBuffer,
    ContentType: 'application/pdf'
  };

  try {
    const result = await s3.upload(params).promise();
    return result.Location; // Returns the URL of the uploaded file
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw error;
  }
};

// Handle form submission
app.post("/submit", upload.none(), async (req, res) => {
  console.log("Incoming body:", req.body);

  const formData = req.body;

  // --- Excel saving ---
  const excelFile = path.join(__dirname, "submissions.xlsx");
  const workbook = new ExcelJS.Workbook();
  if (fs.existsSync(excelFile)) {
    await workbook.xlsx.readFile(excelFile);
  }
  let sheet = workbook.getWorksheet("Submissions");
  if (!sheet) {
    sheet = workbook.addWorksheet("Submissions");
    sheet.addRow(["Timestamp", "Name", "Age", "Sex", "Phone", "Email", "Selections"]);
  }
  sheet.addRow([
    new Date().toLocaleString(),
    formData.name,
    formData.age,
    formData.sex,
    formData.phone,
    formData.email,
    JSON.stringify(formData)
  ]);
  await workbook.xlsx.writeFile(excelFile);

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

  try {
    // --- PDF saving with actual checkboxes ---
    const timestamp = Date.now();
    const pdfFileName = `IBS_${timestamp}.pdf`;
    const pdfPath = path.join(pdfDir, pdfFileName);
    
    // Create a new PDFDocument
    const pdfDoc = await PDFDocument.create();
    const pages = [pdfDoc.addPage([595, 842])]; // A4 size
    
    // Get the form
    const form = pdfDoc.getForm();
    
    // Add standard fonts (corrected)
    // Register fontkit for custom font support
    pdfDoc.registerFontkit(fontkit);
    
    // For now, we'll use Times-Roman which has better Unicode support than Helvetica
    const helveticaFont = pdfDoc.embedStandardFont(StandardFonts.TimesRoman);
    const helveticaBold = pdfDoc.embedStandardFont(StandardFonts.TimesRomanBold);
    
    let currentPage = 0;
    let yPosition = 800; // Start near the top of the page
    
    // Header
    pages[currentPage].drawText("IBS Diagnosis Checklist", {
      x: 50,
      y: yPosition,
      size: 18,
      font: helveticaBold,
    });
    yPosition -= 30;
    
    // Patient Info
    pages[currentPage].drawText(`Name: ${formData.name || ""}`, {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaFont,
    });
    yPosition -= 20;
    
    pages[currentPage].drawText(`Age: ${formData.age || ""}`, {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaFont,
    });
    yPosition -= 20;
    
    pages[currentPage].drawText(`Sex: ${formData.sex || ""}`, {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaFont,
    });
    yPosition -= 20;
    
    pages[currentPage].drawText(`Phone: ${formData.phone || ""}`, {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaFont,
    });
    yPosition -= 20;
    
    pages[currentPage].drawText(`Email: ${formData.email || ""}`, {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaFont,
    });
    yPosition -= 30;
    
    // Loop over each section
    for (const secKey of Object.keys(sectionTitles)) {
      if (yPosition < 100) {
        // Add a new page if we're running out of space
        pages.push(pdfDoc.addPage([595, 842]));
        currentPage++;
        yPosition = 800;
      }
      
      // Section title
      pages[currentPage].drawText(sectionTitles[secKey], {
        x: 50,
        y: yPosition,
        size: 14,
        font: helveticaBold,
      });
      
      // Underline manually since underline option isn't available in standard fonts
      const textWidth = sectionTitles[secKey].length * 7; // Approximate width calculation
      pages[currentPage].drawLine({
        start: { x: 50, y: yPosition - 2 },
        end: { x: 50 + textWidth, y: yPosition - 2 },
        thickness: 1,
        color: rgb(0, 0, 0),
      });
      
      yPosition -= 25;
      
      // User's selections
      const selected = formData[secKey]
        ? Array.isArray(formData[secKey]) ? formData[secKey] : [formData[secKey]]
        : [];
      
      // Create checkboxes for each option
      for (const label of checkboxOptions[secKey]) {
        if (yPosition < 50) {
          // Add a new page if we're running out of space
          pages.push(pdfDoc.addPage([595, 842]));
          currentPage++;
          yPosition = 800;
        }
        
        const isChecked = selected.includes(label);
        
        // Create a checkbox with a simplified field name
        const fieldName = `${secKey}-${label.substring(0, 20).replace(/\s+/g, '-')}`;
        const checkbox = form.createCheckBox(fieldName);
        checkbox.addToPage(pages[currentPage], {
          x: 50,
          y: yPosition - 2,
          width: 12,
          height: 12,
        });
        
        // Check if selected
        if (isChecked) {
          checkbox.check();
        }
        
        // Add label text
        pages[currentPage].drawText(label, {
          x: 70,
          y: yPosition,
          size: 12,
          font: helveticaFont,
        });
        
        yPosition -= 20;
      }
      
      yPosition -= 10; // Add some space between sections
    }
    
    // Save the PDF
    const pdfBytes = await pdfDoc.save();

    // Save locally
    fs.writeFileSync(pdfPath, pdfBytes);

    try {
      // Upload to S3
      const s3Url = await uploadToS3(pdfBytes, pdfFileName);
      res.json({ 
        success: true, 
        message: "Form submitted successfully", 
        pdfUrl: s3Url,
        localPath: pdfPath
      });
    } catch (s3Error) {
      console.error('S3 upload error:', s3Error);
      // Even if S3 upload fails, we still have the local copy
      res.json({ 
        success: true, 
        message: "Form submitted and saved locally (S3 upload failed)", 
        localPath: pdfPath
      });
    }
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).json({ success: false, message: "Error generating PDF: " + error.message });
  }
});

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

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
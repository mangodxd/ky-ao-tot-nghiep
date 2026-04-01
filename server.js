const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 8000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname,'public', 'uploads');
const DATA_FILE = path.join(DATA_DIR, 'sigs.json');

app.use(cors());
app.use(express.json({ limit: '10mb' })); 
app.use(express.static('public'));

// make sure file
async function init() {
    try { await fs.mkdir(DATA_DIR, { recursive: true }); } catch (e) {}
    try { await fs.mkdir(UPLOADS_DIR, { recursive: true }); } catch (e) {}
    try {
        await fs.access(DATA_FILE);
    } catch (e) {
        await fs.writeFile(DATA_FILE, JSON.stringify({ ownerName: "Lorum Ipsum", signatures: [] }));
    }
}

init();

// get info
app.get('/api/signatures', async (req, res) => { 
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (e) {
        res.status(500).json({ success: false, message: e });
    }
});

// push info
app.post('/api/signatures', async (req, res) => {
    try {
        const newSig = req.body;
        
        // save as png
        const base64Data = newSig.signature.replace(/^data:image\/png;base64,/, "");
        const filename = `sig_${Date.now()}_${Math.floor(Math.random()*1000)}.png`;
        await fs.writeFile(path.join(UPLOADS_DIR, filename), base64Data, 'base64');
        
        newSig.signature = `/uploads/${filename}`;

        const fileContent = await fs.readFile(DATA_FILE, 'utf8');
        let data = JSON.parse(fileContent);
        if (!Array.isArray(data.signatures)) data.signatures = [];
        
        data.signatures.push(newSig);
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
        
        res.json({ success: true, newSig: newSig });
    } catch (e) {
        console.error("error while signing");
        res.status(500).json({ success: false, message: e });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running at port ${PORT}`);
});
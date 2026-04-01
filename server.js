require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const { Octokit } = require("@octokit/rest");

const app = express();
const PORT = process.env.PORT || 8000;

const REPO_OWNER = process.env.REPO_OWNER; 
const REPO_NAME = process.env.REPO_NAME;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const octokit = new Octokit({ auth: GITHUB_TOKEN });
const JSON_FILE_PATH = 'sigs.json';

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static('public'));

async function getGitHubFile(path) {
    try {
        const { data } = await octokit.repos.getContent({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            path: path,
        });
        return data;
    } catch (e) {
        return null;
    }
}

async function uploadToGitHub(path, contentBase64, message, sha = null) {
    await octokit.repos.createOrUpdateFileContents({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: path,
        message: message,
        content: contentBase64,
        sha: sha
    });
}

app.get('/ping', (req, res) => {
    res.status(200).send('OK');
});

app.get('/api/signatures', async (req, res) => {
    try {
        const file = await getGitHubFile(JSON_FILE_PATH);
        if (!file) {
            return res.json({ ownerName: "Nguyễn Công Thuận Huy", signatures: [] });
        }
        const content = JSON.parse(Buffer.from(file.content, 'base64').toString());
        res.json(content);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/signatures', async (req, res) => {
    try {
        const newSig = req.body;
        const timestamp = Date.now();
        const fileName = `sig_${timestamp}_${Math.floor(Math.random() * 1000)}.png`;
        const githubImgPath = `signatures/${fileName}`;

        const base64Image = newSig.signature.split(';base64,').pop();
        await uploadToGitHub(githubImgPath, base64Image, `Upload signature: ${fileName}`);

        newSig.signature = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${githubImgPath}`;

        const jsonFile = await getGitHubFile(JSON_FILE_PATH);
        let data = { ownerName: "Nguyễn Công Thuận Huy", signatures: [] };
        let sha = null;

        if (jsonFile) {
            data = JSON.parse(Buffer.from(jsonFile.content, 'base64').toString());
            sha = jsonFile.sha;
        }

        if (!Array.isArray(data.signatures)) data.signatures = [];
        data.signatures.push(newSig);

        const updatedJsonBase64 = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
        await uploadToGitHub(JSON_FILE_PATH, updatedJsonBase64, `Update signatures list for ${newSig.name}`, sha);

        res.json({ success: true, newSig: newSig });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
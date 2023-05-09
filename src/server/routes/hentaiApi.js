
const path = require('path');
const express = require('express');
const router = express.Router();
const db = require("../models/db");
const util = global.requireUtil();
const { isCompress } = util;
const zipInfoDb = require("../models/zipInfoDb");
const serverUtil = require("../serverUtil");
const { title } = require('process');

// get to get all
// http://localhost:8080/api/exhentaiApi
router.get('/api/exhentaiApi', serverUtil.asyncWrapper(async (req, res) => {
    console.time("[/api/exhentaiApi]")
    try{

        // console.time("part 1")
        let tempAllFiles = db.getAllFilePathes().filter(isCompress);
        // console.timeEnd("part 1")

        //pageNum没啥用，还占用后端大量计算资源 
        // console.time("part 2")
        // const zipInfo = zipInfoDb.getZipInfo(tempAllFiles);
        // console.timeEnd("part 2")
        
        // console.time("part 3")
        const result = [];
        tempAllFiles.forEach(fp => {
            // result[key] = Object.assign({}, zipInfo[fp]);
            // 参考const updateFileDb(...) 避免重复计算
            const fileName = path.basename(fp);
            let pObj = serverUtil.parse(fileName);
            if (pObj) {
                const key = path.basename(fp, path.extname(fp)).trim();
                // result[key] = {};
                // result[key].title = pObj.title;
                // result[key].author = pObj.author;
                result.push([key, pObj.title, pObj.author]);
            }
        })
        // console.timeEnd("part 3")
    
        res.setHeader('Cache-Control', 'public, max-age=120');
        res.send({
            allFiles: result
        });
    }catch(e){
        console.error("[/api/exhentaiApi]", e);
    }

    console.timeEnd("[/api/exhentaiApi]")
}));

module.exports = router;

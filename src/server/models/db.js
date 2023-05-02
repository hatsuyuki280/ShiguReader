const _ = require('underscore');
// const pathUtil = require("../pathUtil");
const path = require('path');
const serverUtil = require("../serverUtil");
const util = global.requireUtil();
const { getDirName } = serverUtil;
const { isImage, isCompress, isMusic } = util;

const nameParser = require('../../name-parser');
const namePicker = require("../../human-name-picker");


//file path to file stats
const fileToInfo = {};

module.exports.getAllFilePathes = function () {
    return _.keys(fileToInfo);
};

const getFileToInfo = module.exports.getFileToInfo = function (filePath) {
    if (filePath) {
        return fileToInfo[filePath];
    } else {
        return fileToInfo;
    }
}


const sqlite3 = require('sqlite3').verbose();
const sqlDb = new sqlite3.Database(':memory:');



const _util = require('util');
sqlDb.allSync = _util.promisify(sqlDb.all).bind(sqlDb);
sqlDb.getSync = _util.promisify(sqlDb.get).bind(sqlDb);
sqlDb.runSync = _util.promisify(sqlDb.run).bind(sqlDb);


let stmt_tag_insert ;
let stmt_file_insert;

module.exports.init = async ()=> {
    // TODO
    // 现在图片、zip、文件夹都放这个table 
    // 需要拆开
    await sqlDb.runSync("CREATE TABLE file_table (filePath TEXT NOT NULL PRIMARY KEY, dirPath TEXT, fileName TEXT, \
        sTime INTEGER, isDisplayableInExplorer BOOL, isDisplayableInOnebook BOOL, isCompress BOOL, isFolder BOOL);");

    //todo: http://howto.philippkeller.com/2005/04/24/Tags-Database-schemas/
    await sqlDb.runSync(`CREATE TABLE tag_table (filePath TEXT NOT NULL, tag VARCHAR(50), type VARCHAR(25),
            subtype VARCHAR(25), isCompress BOOL)`);

    stmt_tag_insert = sqlDb.prepare('INSERT OR REPLACE INTO tag_table(filePath, tag, type, subtype, isCompress ) values(?, ?, ?, ?, ?)');
    stmt_file_insert = sqlDb.prepare(`INSERT OR REPLACE INTO file_table(filePath, dirPath, fileName, sTime, 
                isDisplayableInExplorer, isDisplayableInOnebook, 
                isCompress, isFolder ) values(?, ?, ?, ?, ?, ?, ?, ?)`);
}

module.exports.getSQLDB = function () {
    return sqlDb;
}

module.exports.createSqlIndex = function () {
    sqlDb.run(`CREATE INDEX IF NOT EXISTS filePath_index ON file_table (filePath);
                CREATE INDEX IF NOT EXISTS dirPath_index ON file_table (dirPath);
                CREATE INDEX IF NOT EXISTS tag_index ON tag_table (tag);
                CREATE INDEX IF NOT EXISTS tag_filePath_index ON tag_table (filePath); `);
}

const updateFileDb = function (filePath, statObj) {
    console.assert(!!filePath)
    const fileName = path.basename(filePath);

    if (!statObj) {
        console.warn("no statObj");
        statObj = {};
    }

    const isDisplayableInExplorer = util.isDisplayableInExplorer(filePath);
    const isDisplayableInOnebook = util.isDisplayableInOnebook(filePath);

    //set up tags
    const str = isDisplayableInExplorer ? fileName : getDirName(filePath);

    const temp = nameParser.parse(str) || {};
    const nameTags = namePicker.pick(str) || [];
    const musicTags = nameParser.parseMusicTitle(str) || [];
    const tags = _.uniq([].concat(temp.tags, temp.comiket, nameTags, musicTags));
    const authors = temp.authors || [];
    const group = temp.group || "";

    const isCompresFile = isCompress(filePath);
    
    // tag插入sql
    let tags_rows = [];
    tags.forEach(t => {
        if (!authors.includes(t) && group !== t) {
            if (temp.comiket === t) {
                tags_rows.push([filePath, t, "tag", "comiket", isCompresFile]);
            } else {
                tags_rows.push([filePath, t, "tag", "parody", isCompresFile]);
            }
        }
    })
    authors.forEach(t => {
        tags_rows.push([filePath, t, "author", "", isCompresFile]);
    })
    tags_rows.push([filePath, group, "group", "", isCompresFile]);
    tags_rows = tags_rows.filter(e => e[1] && !e[1].match(util.useless_tag_regex))
    // do batch insertion
    if(tags_rows.length > 0){
        for(const row of tags_rows){
            stmt_tag_insert.run(...row);
        }
    }

    //file_table插入
    let aboutTimeA = nameParser.getDateFromParse(str);
    aboutTimeA = aboutTimeA && aboutTimeA.getTime();
    let fileTimeA = statObj.mtimeMs || aboutTimeA;
    const dirPath = path.dirname(filePath);
    // https://www.sqlitetutorial.net/sqlite-nodejs/insert/
    stmt_file_insert.run(filePath, dirPath, fileName, fileTimeA,
        isDisplayableInExplorer, isDisplayableInOnebook, isCompresFile, statObj.isDir);
}

const pfs = require('promise-fs');
//!! same as file-iterator getStat()
module.exports.updateStatToDb = async function (filePath, stat) {
    const statObj = {};
    if (!stat) {
        //seems only happen on mac
        stat = await pfs.stat(filePath)
    }

    statObj.isFile = stat.isFile();
    statObj.isDir = stat.isDirectory();
    statObj.mtimeMs = stat.mtimeMs;
    statObj.mtime = stat.mtime;
    statObj.size = stat.size;
    fileToInfo[filePath] = statObj;
    updateFileDb(filePath, statObj);
}

module.exports.deleteFromDb = function (filePath) {
    delete fileToInfo[filePath];
    sqlDb.run("DELETE FROM file_table where filePath = ?", filePath);
    sqlDb.run("DELETE FROM tag_table where filePath = ?", filePath);
}

module.exports.getImgFolderInfo = function (imgFolders) {
    const imgFolderInfo = {};
    _.keys(imgFolders).forEach(folder => {
        const files = imgFolders[folder];
        const len = files.length;
        let mtimeMs = 0, size = 0, totalImgSize = 0, pageNum = 0, musicNum = 0;
        files.forEach(file => {
            const tempInfo = getFileToInfo(file);
            if (tempInfo) {
                mtimeMs += tempInfo.mtimeMs / len;
                size += tempInfo.size;

                if (isImage(file)) {
                    totalImgSize += tempInfo.size;
                }
            }

            if (isImage(file)) {
                pageNum++;
            } else if (isMusic(file)) {
                musicNum++;
            }
        })

        //!! same as file-iterator getStat()
        imgFolderInfo[folder] = {
            isFile: false,
            isDir: true,
            mtimeMs,
            mtime: mtimeMs,
            size,
            totalImgSize,
            pageNum,
            musicNum
        };
    })

    return imgFolderInfo;
}

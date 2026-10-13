const mysql = require("mysql2/promise");

const dbConfig = require("./dbConfig");

const pool = mysql.createPool(dbConfig());

pool.getConnection()
    .then(connection => {
        console.log("MySQL connection successful!");
        connection.release();
    })
    .catch(error => {
        console.error("MySQL connection failed:");
        console.error(error);
    });

module.exports = pool;
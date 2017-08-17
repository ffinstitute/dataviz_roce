<?php

/**
 * Created by PhpStorm.
 * User: myles
 * Date: 12/7/2017
 * Time: 17:03
 */
class ROCE
{
    private $db;

    function __construct()
    {
        $credential = parse_ini_file(__DIR__ . "/credential.ini", true);
        $db_credential = $credential['database'];

        $this->db = new \PDO("mysql:host={$db_credential['host']};dbname={$db_credential['database']};charset=utf8",
            $db_credential['username'], $db_credential['password'],
            [PDO::ATTR_EMULATE_PREPARES => false, PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    }

    function getCompanies()
    {
        $stmt = $this->db->query('SELECT * FROM `nasdaq`.`companies`;');
        return $stmt->fetchAll(\PDO::FETCH_ASSOC);
    }

    function getROCEs()
    {
        $stmt = $this->db->query('SELECT * FROM `ROCE`;');
        return $stmt->fetchAll(\PDO::FETCH_COLUMN);
    }
}
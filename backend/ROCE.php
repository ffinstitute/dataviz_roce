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
        $credential_paths = [__DIR__ . "/credential.ini", __DIR__ . "/credential.default.ini"];

        foreach ($credential_paths as $credential_path) {
            if (file_exists($credential_path)) {
                $credential = parse_ini_file($credential_path, true);
                break;
            }
        }

        if (empty($credential)) throw new \Exception("Missing credential files");


        $db_credential = $credential['database'];


        $this->db = new \PDO("mysql:host={$db_credential['host']};port={$db_credential['port']};dbname={$db_credential['database']};charset=utf8",
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
        $stmt = $this->db->query('SELECT * FROM `nasdaq`.`ROCE`;');
        $ROCEs = [];
        while ($item = $stmt->fetch(\PDO::FETCH_ASSOC)) {

            $ROCEs[] = [
                'TRV' => $item['total_revenue'],
                "TXR" => $item['tax_rate'],
                'OI' => $item['operating_income'],
                'CE' => $item['capital_employed'],
                'TR' => round($item['turnover_ratio'], 2),
                'OM' => round($item['operating_margin'], 4),
                'RC' => round($item['ROCE'], 4),
                'Y' => $item['year'],
                'cId' => $item['company_id']
            ];
        }
        return $ROCEs;
    }
}
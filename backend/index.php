<?php
/**
 * Created by PhpStorm.
 * User: myles
 * Date: 12/7/2017
 * Time: 16:55
 */
header('Content-Type: application/json');
//require __DIR__ . "/../../vendor/autoload.php";

require_once __DIR__ . "/ROCE.php";

$ROCE = new ROCE();

$dat = [];
switch (@$_GET['item']) {
    case 'company_list':
        $companies = $ROCE->getCompanies();
        sendResponse(['success' => true, 'companies' => $companies]);
        break;

    case 'ROCE_list':
        $ROCEs = $ROCE->getROCEs();
        sendResponse(['success' => true, 'ROCEs' => $ROCEs]);
        break;

    default:
        sendResponse($_GET);
}


function sendResponse($res)
{
    $final_response = json_encode($res);
    if (json_last_error() == 0) {
        echo $final_response;
    } else {
        echo '["error":"Error encoding to JSON"]';
    }
    exit();
}
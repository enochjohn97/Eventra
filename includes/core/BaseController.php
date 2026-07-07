<?php

namespace App\Core;

require_once __DIR__ . '/../../server/config.php';

class BaseController
{
    protected function json($data, $status = 200)
    {
        header('Content-Type: application/json');
        http_response_code($status);
        echo json_encode($data);
        exit();
    }

    protected function getJsonInput()
    {
        return json_decode(file_get_contents('php://input'), true);
    }

    protected function decodeGoogleJWT($credential)
    {
        $parts = explode('.', $credential);
        if (count($parts) < 2) {
            return null;
        }

        $payload = str_replace(['-', '_'], ['+', '/'], $parts[1]);
        $remainder = strlen($payload) % 4;
        if ($remainder) {
            $payload .= str_repeat('=', 4 - $remainder);
        }

        return json_decode(base64_decode($payload), true);
    }

    protected function redirect($url)
    {
        // Ensure absolute URL using SITE_URL when a relative path is provided
        if (strpos($url, 'http://') === 0 || strpos($url, 'https://') === 0) {
            $target = $url;
        } else {
            $target = SITE_URL . $url;
        }
        header("Location: " . $target);
        exit();
    }

    protected function render($view, $data = [])
    {
        extract($data);
        $base = __DIR__ . '/../../' . $view;
        $viewPath = file_exists($base . '.php') ? $base . '.php' : $base . '.html';

        if (file_exists($viewPath)) {
            require $viewPath;
        } else {
            die("View $view not found at $base.php or $base.html");
        }
    }
}

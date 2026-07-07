<?php

namespace App\Core;

require_once __DIR__ . '/../../config.php';

class Router
{
    private $routes = [];

    public function get($path, $handler, $middleware = [])
    {
        $this->addRoute('GET', $path, $handler, $middleware);
    }

    public function post($path, $handler, $middleware = [])
    {
        $this->addRoute('POST', $path, $handler, $middleware);
    }

    private function addRoute($method, $path, $handler, $middleware)
    {
        $this->routes[] = [
            'method' => $method,
            'path' => $path,
            'handler' => $handler,
            'middleware' => $middleware
        ];
    }

    public function dispatch()
    {
        $uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
        $method = $_SERVER['REQUEST_METHOD'];

        // Handle subfolder deployments (e.g., if running in /Eventra/)
        $scriptName = dirname($_SERVER['SCRIPT_NAME']);
        if ($scriptName !== '/' && $scriptName !== '\\') {
            $uri = preg_replace('#^' . preg_quote($scriptName, '#') . '#', '', $uri);
        }

        // Ensure starting slash
        if (empty($uri)) {
            $uri = '/';
        }
        if ($uri[0] !== '/') {
            $uri = '/' . $uri;
        }

        error_log("Router Dispatch: $method $uri (Original: {$_SERVER['REQUEST_URI']}, Base: $scriptName)");

        foreach ($this->routes as $route) {
            $pattern = preg_replace('/\{([a-zA-Z0-9_]+)\}/', '(?P<$1>[a-zA-Z0-9_-]+)', $route['path']);
            $pattern = "#^" . $pattern . "$#";

            if ($route['method'] === $method && preg_match($pattern, $uri, $matches)) {
                // Execute Middleware
                foreach ($route['middleware'] as $mw) {
                    $this->executeMiddleware($mw);
                }

                // Closure handler (e.g. for flat PHP file includes)
                if (is_callable($route['handler'])) {
                    $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
                    return call_user_func_array($route['handler'], $params);
                }

                // Call Handler (Controller@method string)
                list($controller, $action) = explode('@', $route['handler']);
                $controllerClass = "App\\Controllers\\" . $controller;

                if (class_exists($controllerClass)) {
                    $controllerInstance = new $controllerClass();
                    $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
                    return call_user_func_array([$controllerInstance, $action], $params);
                }

                $this->sendError(500, "Controller $controllerClass not found. Check autoloader and case-sensitivity.", $uri);
                error_log("Router Error: Controller $controllerClass not found");
                return;
            }
        }

        $this->sendError(404, "Page Not Found: $uri", $uri);
    }

    private function executeMiddleware($mw)
    {
        if (is_callable($mw)) {
            return call_user_func($mw);
        }

        if (strpos($mw, 'auth:') === 0) {
            $role = substr($mw, 5);
            $this->authMiddleware($role);
            return;
        }

        // Future: resolve from a middleware map
    }

    private function authMiddleware($role)
    {
        // 1. Enforce Session Isolation
        $sessionName = 'EVENTRA_' . strtoupper($role) . '_SESS';

        if (session_name() !== $sessionName) {
            if (session_status() === PHP_SESSION_ACTIVE) {
                session_write_close();
            }
            session_name($sessionName);
        }

        if (session_status() === PHP_SESSION_NONE) {
            require_once __DIR__ . '/../../config.php';
        }

        // 2. Strict Role Check
        if (!isset($_SESSION[$role . '_id']) || ($_SESSION['role'] ?? '') !== $role) {
            // Check for JWT fallback if session is not set (Hybrid Auth)
            $tokenName = "{$role}_token";
            if (isset($_COOKIE[$tokenName]) && ($payload = \App\Helpers\JWTHelper::validateJWT($_COOKIE[$tokenName]))) {
                if ($payload['role'] === $role) {
                    $_SESSION[$role . '_id'] = $payload['id'];
                    $_SESSION['role'] = $role;
                    return; // Success
                }
            }

            // Unauthenticated: Clear session and redirect to role-specific login
            $_SESSION = [];
            session_destroy();

            $loginPath = ($role === 'client') ? '/client/login' : (($role === 'admin') ? '/admin/login' : '/user/login');

            if (isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false) {
                http_response_code(401);
                echo json_encode(['success' => false, 'message' => 'Unauthorized. Please login.', 'redirect' => $loginPath]);
                exit();
            }

            header("Location: " . SITE_URL . $loginPath);
            exit();
        }
    }

    private function sendError($code, $message, $uri = '')
    {
        http_response_code($code);
        $isApi = strpos($uri, '/api/') === 0 || (isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false);

        if ($isApi) {
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'message' => $message]);
        } else {
            echo "<h1>$code - $message</h1>";
        }
        exit();
    }
}

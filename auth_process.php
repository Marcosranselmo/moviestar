<?php 

    require_once("globals.php");
    require_once("db.php");
    require_once("models/User.php");
    require_once("models/Message.php");
    require_once("dao/UserDAO.php");

    $message = new Message($BASE_URL);

    // Resgata o tipo do formulário
    $type = filter_input(INPUT_POST, "type");

    // Veririca o tipo do formulário
    if($type === "register") {

        $name = filter_input(INPUT_POST, "name");
        $lastname = filter_input(INPUT_POST, "lastname");
        $email = filter_input(INPUT_POST, "email");
        $password = filter_input(INPUT_POST, "password");
        $confirmpassword = filter_input(INPUT_POST, "confirmpassword");

        // Verificação de dados mínimos
        if($name && $lastname && $email && $password) {

        }else {

        // Enviar uma msg de erro, de dados faltantes
        $message->setMessage("Por favor, preencha todos os campos.", "error", "back");

        }

    }else if($type === "login") {

    }
    
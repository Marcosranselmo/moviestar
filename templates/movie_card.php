<?php

  if(empty($movie->image)) {
    $movie->image = "movie_cover.jpg";
  }

?>


<!DOCTYPE html>
<html lang="pt-br">

<head>

    <!-- head -->
    <meta charset="utf-8 ">
    <meta name="viewport " content="width=device-width, initial-scale=1.0 " />

    <title>
        Responsive Carousel </title>

    <!-- Stylesheets -->

    <link rel="stylesheet " href="styles/style.css ">


    <link rel="stylesheet " href="styles/carousel.min.css ">


    <!-- javascript -->
    <script src="scripts/jquery-3.5.1.min.js "></script>
    <script src="scripts/carousel.js "></script>
</head>

<body>

    <!--  Demos -->
    <section id="slaide">
        <div class="row">


          <div class="card movie-card">
            <div class="card-img-top" style="background-image: url('<?= $BASE_URL ?>img/movies/<?= $movie->image ?>')"></div>
            <div class="card-body">
              <p class="card-rating">
                <i class="fas fa-star"></i>
                <span class="rating"><?= $movie->rating ?></span>
              </p>
              <h5 class="card-title">
                <a href="<?= $BASE_URL ?>movie.php?id=<?= $movie->id ?>"><?= $movie->title ?></a>
              </h5>
              <a href="<?= $BASE_URL ?>movie.php?id=<?= $movie->id ?>" class="btn btn-primary rate-btn">Avaliar</a>
              <a href="<?= $BASE_URL ?>movie.php?id=<?= $movie->id ?>" class="btn btn-primary card-btn">Conhecer</a>
            </div>
          </div>

          <script>
                    $(document).ready(function() {
                        $('.car-carousel').carCarousel({
                            loop: false,
                            margin: 5,
                            responsiveClass: true,
                            responsive: {
                                0: {
                                    items: 2,
                                    nav: true
                                },
                                600: {
                                    items: 4,
                                    nav: true
                                },
                                1000: {
                                    items: 7,
                                    nav: true,
                                    loop: false,
                                    margin: 3
                                }
                            }
                        })
                    })
                </script>
        </div>
    </section>

</body>

</html>
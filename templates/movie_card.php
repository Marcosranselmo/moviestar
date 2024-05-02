<?php

  if(empty($movie->image)) {
    $movie->image = "movie_cover.jpg";
  }

?>

<!-- <body> -->

    <!--  Demos -->
    <!-- <section id="slaide"> -->
        <!-- <div class="row">
          <div class="large-12 columns"> -->
            <!-- <div class="car-carousel car-theme"> -->


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

              <!-- <script>
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
              </script> -->
            <!-- </div> -->
     <!--      </div>        
        </div> -->
  <!--   </section> -->

<!-- </body> -->


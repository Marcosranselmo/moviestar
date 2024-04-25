(function($, window, document, undefined) {

    /**
     * Cria um carrossel.
     * @class O carrossel do carro.
     * @public
     * @param {HTMLElement|jQuery} element - O elemento para criar o carrossel para.
     * @param {Object} [options] - as opções
     */
    function car(element, options) {

        /**
         * Configurações atuais do carrossel.
         * @public
         */
        this.settings = null;

        /**
         * Opções atuais definidas pelo chamador, incluindo padrões.
         * @public
         */
        this.options = $.extend({}, car.Defaults, options);

        /**
         * Plugin elemento.
         * @public
         */
        this.$element = $(element);

        /**
         * Manipuladores de eventos com proxy
         * @protected
         */
        this._handlers = {};

        /**
         * Referências aos plugins em execução deste carrossel.
         * @protected
         */
        this._plugins = {};

        /**
         * Eventos atualmente suprimidos para evitar que sejam acionados novamente.
         * @protected
         */
        this._supress = {};

        /**
         * Posição atual absoluta.
         * @protected
         */
        this._current = null;

        /**
         * Velocidade de animação em milissegundos.
         * @protected
         */
        this._speed = null;

        /**
         * Coordenadas de todos os itens em pixel.
         * @todo O nome deste membro é enganoso.
         * @protected
         */
        this._coordinates = [];

        /**
         * Ponto de interrupção atual.
         * @todo Consultas de mídia reais seriam boas.
         * @protected
         */
        this._breakpoint = null;

        /**
         * Largura atual do elemento de plug-in.
         */
        this._width = null;

        /**
         * Todos os itens reais.
         * @protected
         */
        this._items = [];

        /**
         * Todos os itens clonados.
         * @protected
         */
        this._clones = [];

        /**
         * Mesclar valores de todos os itens.
         * @todo Talvez isso possa ser parte de um plugin.
         * @protected
         */
        this._mergers = [];

        /**
         * Larguras de todos os itens.
         */
        this._widths = [];

        /**
         * Partes invalidadas no processo de atualização.
         * @protected
         */
        this._invalidated = {};

        /**
         * Lista ordenada de trabalhadores para o processo de atualização.
         * @protected
         */
        this._pipe = [];

        /**
         * Informações do estado atual para a operação de arrastar.
         * @todo #261
         * @protected
         */
        this._drag = {
            time: null,
            target: null,
            pointer: null,
            stage: {
                start: null,
                current: null
            },
            direction: null
        };

        /**
         * Informações do estado atual e suas tags.
         * @type {Object}
         * @protected
         */
        this._states = {
            current: {},
            tags: {
                'initializing': ['busy'],
                'animating': ['busy'],
                'dragging': ['interacting']
            }
        };

        $.each(['onResize', 'onThrottledResize'], $.proxy(function(i, handler) {
            this._handlers[handler] = $.proxy(this[handler], this);
        }, this));

        $.each(car.Plugins, $.proxy(function(key, plugin) {
            this._plugins[key.charAt(0).toLowerCase() + key.slice(1)] = new plugin(this);
        }, this));

        $.each(car.Workers, $.proxy(function(priority, worker) {
            this._pipe.push({
                'filter': worker.filter,
                'run': $.proxy(worker.run, this)
            });
        }, this));

        this.setup();
        this.initialize();
    }

    /**
     * Opções padrão para o carrossel.
     * @public
     */
    car.Defaults = {
        items: 3,
        loop: false,
        center: false,
        rewind: false,
        checkVisibility: true,

        mouseDrag: true,
        touchDrag: true,
        pullDrag: true,
        freeDrag: false,

        margin: 0,
        stagePadding: 0,

        merge: false,
        mergeFit: true,
        autoWidth: false,

        startPosition: 0,
        rtl: false,

        smartSpeed: 250,
        fluidSpeed: false,
        dragEndSpeed: false,

        responsive: {},
        responsiveRefreshRate: 200,
        responsiveBaseElement: window,

        fallbackEasing: 'swing',
        slideTransition: '',

        info: false,

        nestedItemSelector: false,
        itemElement: 'div',
        stageElement: 'div',

        refreshClass: 'car-refresh',
        loadedClass: 'car-loaded',
        loadingClass: 'car-loading',
        rtlClass: 'car-rtl',
        responsiveClass: 'car-responsive',
        dragClass: 'car-drag',
        itemClass: 'car-item',
        stageClass: 'car-stage',
        stageOuterClass: 'car-stage-outer',
        grabClass: 'car-grab'
    };

    /**
     * Enumeração para largura.
     * @public
     * @readonly
     * @enum {String}
     */
    car.Width = {
        Default: 'default',
        Inner: 'inner',
        Outer: 'outer'
    };

    /**
     * Enumeração de tipos.
     * @public
     * @readonly
     * @enum {String}
     */
    car.Type = {
        Event: 'event',
        State: 'state'
    };

    /**
     * Contém todos os plugins registrados.
     * @public
     */
    car.Plugins = {};

    /**
     * Lista de trabalhadores envolvidos no processo de atualização.
     */
    car.Workers = [{
        filter: ['width', 'settings'],
        run: function() {
            this._width = this.$element.width();
        }
    }, {
        filter: ['width', 'items', 'settings'],
        run: function(cache) {
            cache.current = this._items && this._items[this.relative(this._current)];
        }
    }, {
        filter: ['items', 'settings'],
        run: function() {
            this.$stage.children('.cloned').remove();
        }
    }, {
        filter: ['width', 'items', 'settings'],
        run: function(cache) {
            var margin = this.settings.margin || '',
                grid = !this.settings.autoWidth,
                rtl = this.settings.rtl,
                css = {
                    'width': 'auto',
                    'margin-left': rtl ? margin : '',
                    'margin-right': rtl ? '' : margin
                };

            !grid && this.$stage.children().css(css);

            cache.css = css;
        }
    }, {
        filter: ['width', 'items', 'settings'],
        run: function(cache) {
            var width = (this.width() / this.settings.items).toFixed(3) - this.settings.margin,
                merge = null,
                iterator = this._items.length,
                grid = !this.settings.autoWidth,
                widths = [];

            cache.items = {
                merge: false,
                width: width
            };

            while (iterator--) {
                merge = this._mergers[iterator];
                merge = this.settings.mergeFit && Math.min(merge, this.settings.items) || merge;

                cache.items.merge = merge > 1 || cache.items.merge;

                widths[iterator] = !grid ? this._items[iterator].width() : width * merge;
            }

            this._widths = widths;
        }
    }, {
        filter: ['items', 'settings'],
        run: function() {
            var clones = [],
                items = this._items,
                settings = this.settings,
                // TODO: Deve ser calculado a partir do número de itens de largura mínima no estágio
                view = Math.max(settings.items * 2, 4),
                size = Math.ceil(items.length / 2) * 2,
                repeat = settings.loop && items.length ? settings.rewind ? view : Math.max(view, size) : 0,
                append = '',
                prepend = '';

            repeat /= 2;

            while (repeat > 0) {
                // Mudar para usar apenas clones de acréscimo
                clones.push(this.normalize(clones.length / 2, true));
                append = append + items[clones[clones.length - 1]][0].outerHTML;
                clones.push(this.normalize(items.length - 1 - (clones.length - 1) / 2, true));
                prepend = items[clones[clones.length - 1]][0].outerHTML + prepend;
                repeat -= 1;
            }

            this._clones = clones;

            $(append).addClass('cloned').appendTo(this.$stage);
            $(prepend).addClass('cloned').prependTo(this.$stage);
        }
    }, {
        filter: ['width', 'items', 'settings'],
        run: function() {
            var rtl = this.settings.rtl ? 1 : -1,
                size = this._clones.length + this._items.length,
                iterator = -1,
                previous = 0,
                current = 0,
                coordinates = [];

            while (++iterator < size) {
                previous = coordinates[iterator - 1] || 0;
                current = this._widths[this.relative(iterator)] + this.settings.margin;
                coordinates.push(previous + current * rtl);
            }

            this._coordinates = coordinates;
        }
    }, {
        filter: ['width', 'items', 'settings'],
        run: function() {
            var padding = this.settings.stagePadding,
                coordinates = this._coordinates,
                css = {
                    'width': Math.ceil(Math.abs(coordinates[coordinates.length - 1])) + padding * 2,
                    'padding-left': padding || '',
                    'padding-right': padding || ''
                };

            this.$stage.css(css);
        }
    }, {
        filter: ['width', 'items', 'settings'],
        run: function(cache) {
            var iterator = this._coordinates.length,
                grid = !this.settings.autoWidth,
                items = this.$stage.children();

            if (grid && cache.items.merge) {
                while (iterator--) {
                    cache.css.width = this._widths[this.relative(iterator)];
                    items.eq(iterator).css(cache.css);
                }
            } else if (grid) {
                cache.css.width = cache.items.width;
                items.css(cache.css);
            }
        }
    }, {
        filter: ['items'],
        run: function() {
            this._coordinates.length < 1 && this.$stage.removeAttr('style');
        }
    }, {
        filter: ['width', 'items', 'settings'],
        run: function(cache) {
            cache.current = cache.current ? this.$stage.children().index(cache.current) : 0;
            cache.current = Math.max(this.minimum(), Math.min(this.maximum(), cache.current));
            this.reset(cache.current);
        }
    }, {
        filter: ['position'],
        run: function() {
            this.animate(this.coordinates(this._current));
        }
    }, {
        filter: ['width', 'position', 'items', 'settings'],
        run: function() {
            var rtl = this.settings.rtl ? 1 : -1,
                padding = this.settings.stagePadding * 2,
                begin = this.coordinates(this.current()) + padding,
                end = begin + this.width() * rtl,
                inner, outer, matches = [],
                i, n;

            for (i = 0, n = this._coordinates.length; i < n; i++) {
                inner = this._coordinates[i - 1] || 0;
                outer = Math.abs(this._coordinates[i]) + padding * rtl;

                if ((this.op(inner, '<=', begin) && (this.op(inner, '>', end))) ||
                    (this.op(outer, '<', begin) && this.op(outer, '>', end))) {
                    matches.push(i);
                }
            }

            this.$stage.children('.active').removeClass('active');
            this.$stage.children(':eq(' + matches.join('), :eq(') + ')').addClass('active');

            this.$stage.children('.center').removeClass('center');
            if (this.settings.center) {
                this.$stage.children().eq(this.current()).addClass('center');
            }
        }
    }];

    /**
     * Criar o elemento DOM de palco
     */
    car.prototype.initializeStage = function() {
        this.$stage = this.$element.find('.' + this.settings.stageClass);

        // se o estágio já estiver no DOM, pegue-o e pule a inicialização do estágio
        if (this.$stage.length) {
            return;
        }

        this.$element.addClass(this.options.loadingClass);

        // criar palco
        this.$stage = $('<' + this.settings.stageElement + '>', {
            "class": this.settings.stageClass
        }).wrap($('<div/>', {
            "class": this.settings.stageOuterClass
        }));

        // etapa de anexação
        this.$element.append(this.$stage.parent());
    };

    /**
     * Criar elementos DOM de item
     */
    car.prototype.initializeItems = function() {
        var $items = this.$element.find('.car-item');

        // se os itens já estiverem no DOM, pegue-os e pule a inicialização do item
        if ($items.length) {
            this._items = $items.get().map(function(item) {
                return $(item);
            });

            this._mergers = this._items.map(function() {
                return 1;
            });

            this.refresh();

            return;
        }

        // anexar conteúdo
        this.replace(this.$element.children().not(this.$stage.parent()));

        // verifique a visibilidade
        if (this.isVisible()) {
            // atualizar visualização
            this.refresh();
        } else {
            // invalidar largura
            this.invalidate('width');
        }

        this.$element
            .removeClass(this.options.loadingClass)
            .addClass(this.options.loadedClass);
    };

    /**
     * Inicializa o carrossel.
     * @protected
     */
    car.prototype.initialize = function() {
        this.enter('initializing');
        this.trigger('initialize');

        this.$element.toggleClass(this.settings.rtlClass, this.settings.rtl);

        if (this.settings.autoWidth && !this.is('pre-loading')) {
            var imgs, nestedSelector, width;
            imgs = this.$element.find('img');
            nestedSelector = this.settings.nestedItemSelector ? '.' + this.settings.nestedItemSelector : undefined;
            width = this.$element.children(nestedSelector).width();

            if (imgs.length && width <= 0) {
                this.preloadAutoWidthImages(imgs);
            }
        }

        this.initializeStage();
        this.initializeItems();

        // registrar manipuladores de eventos
        this.registerEventHandlers();

        this.leave('initializing');
        this.trigger('initialized');
    };

    /**
     * @returns {Boolean} visibilidade do elemento $
     * se você sabe que o carrossel sempre estará visível, você pode definir `checkVisibility` como `false` para
     * evita o reflow forçado do layout do navegador caro que o $element.is(':visible') faz
     */
    car.prototype.isVisible = function() {
        return this.settings.checkVisibility ?
            this.$element.is(':visible') :
            true;
    };

    /**
     *Configura as configurações atuais.
     * @todo Remova as classes responsivas. Por que os designs adaptáveis devem ser trazidos para o IE8?
     * @todo Suporte para consultas de mídia usando `matchMedia` seria bom.
     * @public
     */
    car.prototype.setup = function() {
        var viewport = this.viewport(),
            overwrites = this.options.responsive,
            match = -1,
            settings = null;

        if (!overwrites) {
            settings = $.extend({}, this.options);
        } else {
            $.each(overwrites, function(breakpoint) {
                if (breakpoint <= viewport && breakpoint > match) {
                    match = Number(breakpoint);
                }
            });

            settings = $.extend({}, this.options, overwrites[match]);
            if (typeof settings.stagePadding === 'function') {
                settings.stagePadding = settings.stagePadding();
            }
            delete settings.responsive;

            // classe responsiva
            if (settings.responsiveClass) {
                this.$element.attr('class',
                    this.$element.attr('class').replace(new RegExp('(' + this.options.responsiveClass + '-)\\S+\\s', 'g'), '$1' + match)
                );
            }
        }

        this.trigger('change', { property: { name: 'settings', value: settings } });
        this._breakpoint = match;
        this.settings = settings;
        this.invalidate('settings');
        this.trigger('changed', { property: { name: 'settings', value: this.settings } });
    };

    /**
     * Atualiza a lógica de opções, se necessário.
     * @protected
     */
    car.prototype.optionsLogic = function() {
        if (this.settings.autoWidth) {
            this.settings.stagePadding = false;
            this.settings.merge = false;
        }
    };

    /**
     * Prepara um item antes de adicionar.
     * @todo Renomeie o parâmetro de evento `content` para `item`.
     * @protected
     * @returns {jQuery|HTMLElement} - O recipiente de itens.
     */
    car.prototype.prepare = function(item) {
        var event = this.trigger('prepare', { content: item });

        if (!event.data) {
            event.data = $('<' + this.settings.itemElement + '/>')
                .addClass(this.options.itemClass).append(item)
        }

        this.trigger('prepared', { content: event.data });

        return event.data;
    };

    /**
     * Atualiza a visualização.
     * @public
     */
    car.prototype.update = function() {
        var i = 0,
            n = this._pipe.length,
            filter = $.proxy(function(p) { return this[p] }, this._invalidated),
            cache = {};

        while (i < n) {
            if (this._invalidated.all || $.grep(this._pipe[i].filter, filter).length > 0) {
                this._pipe[i].run(cache);
            }
            i++;
        }

        this._invalidated = {};

        !this.is('valid') && this.enter('valid');
    };

    /**
     * Obtém a largura da visualização
     * @public
     * @param {car.Width} [dimension=car.Width.Default] - A dimensão a retornar.
     * @returns {Number} - A largura da visualização em pixel.
     */
    car.prototype.width = function(dimension) {
        dimension = dimension || car.Width.Default;
        switch (dimension) {
            case car.Width.Inner:
            case car.Width.Outer:
                return this._width;
            default:
                return this._width - this.settings.stagePadding * 2 + this.settings.margin;
        }
    };

    /**
     * Atualiza o carrossel principalmente para fins adaptativos.
     * @public
     */
    car.prototype.refresh = function() {
        this.enter('refreshing');
        this.trigger('refresh');

        this.setup();

        this.optionsLogic();

        this.$element.addClass(this.options.refreshClass);

        this.update();

        this.$element.removeClass(this.options.refreshClass);

        this.leave('refreshing');
        this.trigger('refreshed');
    };

    /**
     * Verifica o evento `resize` da janela.
     * @protected
     */
    car.prototype.onThrottledResize = function() {
        window.clearTimeout(this.resizeTimer);
        this.resizeTimer = window.setTimeout(this._handlers.onResize, this.settings.responsiveRefreshRate);
    };

    /**Verifica o evento `resize` da janela.
     * @protected
     */
    car.prototype.onResize = function() {
        if (!this._items.length) {
            return false;
        }

        if (this._width === this.$element.width()) {
            return false;
        }

        if (!this.isVisible()) {
            return false;
        }

        this.enter('resizing');

        if (this.trigger('resize').isDefaultPrevented()) {
            this.leave('resizing');
            return false;
        }

        this.invalidate('width');

        this.refresh();

        this.leave('resizing');
        this.trigger('resized');
    };

    /**
     * Registra manipuladores de eventos.
     * @todo Verifique `msPointerEnabled`
     * @todo #261
     * @protected
     */
    car.prototype.registerEventHandlers = function() {
        if ($.support.transition) {
            this.$stage.on($.support.transition.end + '.car.core', $.proxy(this.onTransitionEnd, this));
        }

        if (this.settings.responsive !== false) {
            this.on(window, 'resize', this._handlers.onThrottledResize);
        }

        if (this.settings.mouseDrag) {
            this.$element.addClass(this.options.dragClass);
            this.$stage.on('mousedown.car.core', $.proxy(this.onDragStart, this));
            this.$stage.on('dragstart.car.core selectstart.car.core', function() { return false });
        }

        if (this.settings.touchDrag) {
            this.$stage.on('touchstart.car.core', $.proxy(this.onDragStart, this));
            this.$stage.on('touchcancel.car.core', $.proxy(this.onDragEnd, this));
        }
    };

    /**
     * Manipula eventos `touchstart` e `mousedown`.
     * @todo Limite de deslizamento horizontal como opção
     * @todo #261
     * @protected
     * @param {Event} event - Os argumentos do evento.
     */
    car.prototype.onDragStart = function(event) {
        var stage = null;

        if (event.which === 3) {
            return;
        }

        if ($.support.transform) {
            stage = this.$stage.css('transform').replace(/.*\(|\)| /g, '').split(',');
            stage = {
                x: stage[stage.length === 16 ? 12 : 4],
                y: stage[stage.length === 16 ? 13 : 5]
            };
        } else {
            stage = this.$stage.position();
            stage = {
                x: this.settings.rtl ?
                    stage.left + this.$stage.width() - this.width() + this.settings.margin : stage.left,
                y: stage.top
            };
        }

        if (this.is('animating')) {
            $.support.transform ? this.animate(stage.x) : this.$stage.stop()
            this.invalidate('position');
        }

        this.$element.toggleClass(this.options.grabClass, event.type === 'mousedown');

        this.speed(0);

        this._drag.time = new Date().getTime();
        this._drag.target = $(event.target);
        this._drag.stage.start = stage;
        this._drag.stage.current = stage;
        this._drag.pointer = this.pointer(event);

        $(document).on('mouseup.car.core touchend.car.core', $.proxy(this.onDragEnd, this));

        $(document).one('mousemove.car.core touchmove.car.core', $.proxy(function(event) {
            var delta = this.difference(this._drag.pointer, this.pointer(event));

            $(document).on('mousemove.car.core touchmove.car.core', $.proxy(this.onDragMove, this));

            if (Math.abs(delta.x) < Math.abs(delta.y) && this.is('valid')) {
                return;
            }

            event.preventDefault();

            this.enter('dragging');
            this.trigger('drag');
        }, this));
    };

    /**
     * Manipula os eventos `touchmove` e `mousemove`.
     * @todo #261
     * @protected
     * @param {Event} event - Os argumentos do evento.
     */
    car.prototype.onDragMove = function(event) {
        var minimum = null,
            maximum = null,
            pull = null,
            delta = this.difference(this._drag.pointer, this.pointer(event)),
            stage = this.difference(this._drag.stage.start, delta);

        if (!this.is('dragging')) {
            return;
        }

        event.preventDefault();

        if (this.settings.loop) {
            minimum = this.coordinates(this.minimum());
            maximum = this.coordinates(this.maximum() + 1) - minimum;
            stage.x = (((stage.x - minimum) % maximum + maximum) % maximum) + minimum;
        } else {
            minimum = this.settings.rtl ? this.coordinates(this.maximum()) : this.coordinates(this.minimum());
            maximum = this.settings.rtl ? this.coordinates(this.minimum()) : this.coordinates(this.maximum());
            pull = this.settings.pullDrag ? -1 * delta.x / 5 : 0;
            stage.x = Math.max(Math.min(stage.x, minimum + pull), maximum + pull);
        }

        this._drag.stage.current = stage;

        this.animate(stage.x);
    };

    /**
     * Manipula os eventos `touchend` e `mouseup`.
     * @todo #261
     * @todo Limite para evento de clique
     * @protected
     * @param {Event} event - Os argumentos do evento.
     */
    car.prototype.onDragEnd = function(event) {
        var delta = this.difference(this._drag.pointer, this.pointer(event)),
            stage = this._drag.stage.current,
            direction = delta.x > 0 ^ this.settings.rtl ? 'left' : 'right';

        $(document).off('.car.core');

        this.$element.removeClass(this.options.grabClass);

        if (delta.x !== 0 && this.is('dragging') || !this.is('valid')) {
            this.speed(this.settings.dragEndSpeed || this.settings.smartSpeed);
            this.current(this.closest(stage.x, delta.x !== 0 ? direction : this._drag.direction));
            this.invalidate('position');
            this.update();

            this._drag.direction = direction;

            if (Math.abs(delta.x) > 3 || new Date().getTime() - this._drag.time > 300) {
                this._drag.target.one('click.car.core', function() { return false; });
            }
        }

        if (!this.is('dragging')) {
            return;
        }

        this.leave('dragging');
        this.trigger('dragged');
    };

    /**
     * Obtenha a posição absoluta do item mais próximo para uma coordenada.
     * @todo Definir `freeDrag` torna `mais próximo` não reutilizável. Veja #165.
     * @protected
     * @param {Number} coordinate - A coordenada em pixel.
     * @param {String} direction - A direção para verificar o item mais próximo. Ou `esquerda` ou `direita`.
     * @return {Number} - A posição absoluta do item mais próximo.
     */
    car.prototype.closest = function(coordinate, direction) {
        var position = -1,
            pull = 30,
            width = this.width(),
            coordinates = this.coordinates();

        if (!this.settings.freeDrag) {
            // verifique o item mais próximo
            $.each(coordinates, $.proxy(function(index, value) {
                // em um puxão para a esquerda, verifique o índice atual
                if (direction === 'left' && coordinate > value - pull && coordinate < value + pull) {
                    position = index;
                    // em um puxão para a direita, verifique no índice anterior
                    // para fazer isso, subtraia a largura do valor e defina position = index + 1
                } else if (direction === 'right' && coordinate > value - width - pull && coordinate < value - width + pull) {
                    position = index + 1;
                } else if (this.op(coordinate, '<', value) &&
                    this.op(coordinate, '>', coordinates[index + 1] !== undefined ? coordinates[index + 1] : value - width)) {
                    position = direction === 'left' ? index + 1 : index;
                }
                return position === -1;
            }, this));
        }

        if (!this.settings.loop) {
            // limites sem loop
            if (this.op(coordinate, '>', coordinates[this.minimum()])) {
                position = coordinate = this.minimum();
            } else if (this.op(coordinate, '<', coordinates[this.maximum()])) {
                position = coordinate = this.maximum();
            }
        }

        return position;
    };

    /**
     * Anima o palco.
     * @todo #270
     * @public
     * @param {Number} coordinate - A coordenada em pixels.
     */
    car.prototype.animate = function(coordinate) {
        var animate = this.speed() > 0;

        this.is('animating') && this.onTransitionEnd();

        if (animate) {
            this.enter('animating');
            this.trigger('translate');
        }

        if ($.support.transform3d && $.support.transition) {
            this.$stage.css({
                transform: 'translate3d(' + coordinate + 'px,0px,0px)',
                transition: (this.speed() / 1000) + 's' + (
                    this.settings.slideTransition ? ' ' + this.settings.slideTransition : ''
                )
            });
        } else if (animate) {
            this.$stage.animate({
                left: coordinate + 'px'
            }, this.speed(), this.settings.fallbackEasing, $.proxy(this.onTransitionEnd, this));
        } else {
            this.$stage.css({
                left: coordinate + 'px'
            });
        }
    };

    /**
     * Verifica se o carrossel está em um estado específico ou não.
     * @param {String} state - O estado a verificar.
     * @returns {Boolean} - o sinalizador que indica se o carrossel está ocupado.
     */
    car.prototype.is = function(state) {
        return this._states.current[state] && this._states.current[state] > 0;
    };

    /**
     * Define a posição absoluta do item atual.
     * @public
     * @param {Number} [position] - a nova posição absoluta ou nada para deixá-la inalterada.
     * @returns {Number} - A posição absoluta do item atual.
     */
    car.prototype.current = function(position) {
        if (position === undefined) {
            return this._current;
        }

        if (this._items.length === 0) {
            return undefined;
        }

        position = this.normalize(position);

        if (this._current !== position) {
            var event = this.trigger('change', { property: { name: 'position', value: position } });

            if (event.data !== undefined) {
                position = this.normalize(event.data);
            }

            this._current = position;

            this.invalidate('position');

            this.trigger('changed', { property: { name: 'position', value: this._current } });
        }

        return this._current;
    };

    /**
     * Invalida a parte especificada da rotina de atualização.
     * @param {String} [part] - A parte a invalidar.
     * @returns {Array.<String>} - As partes invalidadas.
     */
    car.prototype.invalidate = function(part) {
        if ($.type(part) === 'string') {
            this._invalidated[part] = true;
            this.is('valid') && this.leave('valid');
        }
        return $.map(this._invalidated, function(v, i) { return i });
    };

    /**
     * Redefine a posição absoluta do item atual.
     * @public
     * @param {Number} position - A posição absoluta do novo item.
     */
    car.prototype.reset = function(position) {
        position = this.normalize(position);

        if (position === undefined) {
            return;
        }

        this._speed = 0;
        this._current = position;

        this.suppress(['translate', 'translated']);

        this.animate(this.coordinates(position));

        this.release(['translate', 'translated']);
    };

    /**
     * Normaliza uma posição absoluta ou relativa de um item.
     * @public
     * @param {Number} position - A posição absoluta ou relativa a ser normalizada.
     * @param {Boolean} [relative=false] - Se a posição dada é relativa ou não.
     * @returns {Number} - A posição normalizada.
     */
    car.prototype.normalize = function(position, relative) {
        var n = this._items.length,
            m = relative ? 0 : this._clones.length;

        if (!this.isNumeric(position) || n < 1) {
            position = undefined;
        } else if (position < 0 || position >= n + m) {
            position = ((position - m / 2) % n + n) % n + m / 2;
        }

        return position;
    };

    /**
     * Converte uma posição absoluta de um item em uma relativa.
     * @public
     * @param {Number} position - A posição absoluta a ser convertida.
     * @returns {Number} - A posição convertida.
     */
    car.prototype.relative = function(position) {
        position -= this._clones.length / 2;
        return this.normalize(position, true);
    };

    /**
     * Obtém a posição máxima para o item atual.
     * @public
     * @param {Boolean} [relative=false] - Se deve retornar uma posição absoluta ou relativa.
     * @returns {Number}
     */
    car.prototype.maximum = function(relative) {
        var settings = this.settings,
            maximum = this._coordinates.length,
            iterator,
            reciprocalItemsWidth,
            elementWidth;

        if (settings.loop) {
            maximum = this._clones.length / 2 + this._items.length - 1;
        } else if (settings.autoWidth || settings.merge) {
            iterator = this._items.length;
            if (iterator) {
                reciprocalItemsWidth = this._items[--iterator].width();
                elementWidth = this.$element.width();
                while (iterator--) {
                    reciprocalItemsWidth += this._items[iterator].width() + this.settings.margin;
                    if (reciprocalItemsWidth > elementWidth) {
                        break;
                    }
                }
            }
            maximum = iterator + 1;
        } else if (settings.center) {
            maximum = this._items.length - 1;
        } else {
            maximum = this._items.length - settings.items;
        }

        if (relative) {
            maximum -= this._clones.length / 2;
        }

        return Math.max(maximum, 0);
    };

    /**
     * Obtém a posição mínima para o item atual.
     * @public
     * @param {Boolean} [relative=false] - Se deve retornar uma posição absoluta ou relativa.
     * @returns {Number}
     */
    car.prototype.minimum = function(relative) {
        return relative ? 0 : this._clones.length / 2;
    };

    /**
     * Obtém um item na posição relativa especificada.
     * @public
     * @param {Number} [position] - A posição relativa do item.
     * @return {jQuery|Array.<jQuery>} - O item na posição dada ou todos os itens se nenhuma posição foi dada.
     */
    car.prototype.items = function(position) {
        if (position === undefined) {
            return this._items.slice();
        }

        position = this.normalize(position, true);
        return this._items[position];
    };

    /**
     * Obtém um item na posição relativa especificada.
     * @public
     * @param {Number} [position] - A posição relativa do item.
     * @return {jQuery|Array.<jQuery>} - O item na posição dada ou todos os itens se nenhuma posição foi dada.
     */
    car.prototype.mergers = function(position) {
        if (position === undefined) {
            return this._mergers.slice();
        }

        position = this.normalize(position, true);
        return this._mergers[position];
    };

    /**
     * Obtém as posições absolutas dos clones de um item.
     * @public
     * @param {Number} [position] - A posição relativa do item.
     * @returns {Array.<Number>} - As posições absolutas dos clones para o item ou todos se nenhuma posição for fornecida.
     */
    car.prototype.clones = function(position) {
        var odd = this._clones.length / 2,
            even = odd + this._items.length,
            map = function(index) { return index % 2 === 0 ? even + index / 2 : odd - (index + 1) / 2 };

        if (position === undefined) {
            return $.map(this._clones, function(v, i) { return map(i) });
        }

        return $.map(this._clones, function(v, i) { return v === position ? map(i) : null });
    };

    /**
     * Define a velocidade de animação atual.
     * @public
     * @param {Number} [speed] - A velocidade da animação em milissegundos ou nada para deixá-la inalterada.
     * @returns {Number} - Tvelocidade de animação atual em milissegundos.
     */
    car.prototype.speed = function(speed) {
        if (speed !== undefined) {
            this._speed = speed;
        }

        return this._speed;
    };

    /**
     * Obtém a coordenada de um item.
     * @todo O nome deste método é enganoso.
     * @public
     * @param {Number} position - A posição absoluta do item dentro de `minimum()` e `maximum()`.
     * @returns {Number|Array.<Number>} - A coordenada do item em pixel ou todas as coordenadas.
     */
    car.prototype.coordinates = function(position) {
        var multiplier = 1,
            newPosition = position - 1,
            coordinate;

        if (position === undefined) {
            return $.map(this._coordinates, $.proxy(function(coordinate, index) {
                return this.coordinates(index);
            }, this));
        }

        if (this.settings.center) {
            if (this.settings.rtl) {
                multiplier = -1;
                newPosition = position + 1;
            }

            coordinate = this._coordinates[position];
            coordinate += (this.width() - coordinate + (this._coordinates[newPosition] || 0)) / 2 * multiplier;
        } else {
            coordinate = this._coordinates[newPosition] || 0;
        }

        coordinate = Math.ceil(coordinate);

        return coordinate;
    };

    /**
     * Calcula a velocidade para uma tradução.
     * @protected
     * @param {Number} from - A posição absoluta do item inicial.
     * @param {Number} to - A posição absoluta do item de destino.
     * @param {Number} [factor=undefined] - O fator de tempo em milissegundos.
     * @returns {Number} - O tempo em milissegundos para a tradução.
     */
    car.prototype.duration = function(from, to, factor) {
        if (factor === 0) {
            return 0;
        }

        return Math.min(Math.max(Math.abs(to - from), 1), 6) * Math.abs((factor || this.settings.smartSpeed));
    };

    /**
     * Desliza para o item especificado.
     * @public
     * @param {Number} position - A posição do item.
     * @param {Number} [speed] - O tempo em milissegundos para a transição.
     */
    car.prototype.to = function(position, speed) {
        var current = this.current(),
            revert = null,
            distance = position - this.relative(current),
            direction = (distance > 0) - (distance < 0),
            items = this._items.length,
            minimum = this.minimum(),
            maximum = this.maximum();

        if (this.settings.loop) {
            if (!this.settings.rewind && Math.abs(distance) > items / 2) {
                distance += direction * -1 * items;
            }

            position = current + distance;
            revert = ((position - minimum) % items + items) % items + minimum;

            if (revert !== position && revert - distance <= maximum && revert - distance > 0) {
                current = revert - distance;
                position = revert;
                this.reset(current);
            }
        } else if (this.settings.rewind) {
            maximum += 1;
            position = (position % maximum + maximum) % maximum;
        } else {
            position = Math.max(minimum, Math.min(maximum, position));
        }

        this.speed(this.duration(current, position, speed));
        this.current(position);

        if (this.isVisible()) {
            this.update();
        }
    };

    /**
     * Desliza para o próximo item.
     * @public
     * @param {Number} [speed] - O tempo em milissegundos para a transição.
     */
    car.prototype.next = function(speed) {
        speed = speed || false;
        this.to(this.relative(this.current()) + 1, speed);
    };

    /**
     * Desliza para o item anterior.
     * @public
     * @param {Number} [speed] - O tempo em milissegundos para a transição.
     */
    car.prototype.prev = function(speed) {
        speed = speed || false;
        this.to(this.relative(this.current()) - 1, speed);
    };

    /**
     * Manipula o final de uma animação.
     * @protected
     * @param {Event} event - Os argumentos do evento.
     */
    car.prototype.onTransitionEnd = function(event) {

        // se animação css2, então o objeto de evento é indefinido
        if (event !== undefined) {
            event.stopPropagation();

            // Capturar apenas o evento de transição de estágio de carro
            if ((event.target || event.srcElement || event.originalTarget) !== this.$stage.get(0)) {
                return false;
            }
        }

        this.leave('animating');
        this.trigger('translated');
    };

    /**
     * Obtenha a largura da janela de visualização.
     * @protected
     * @return {Number} - A largura em pixels.
     */
    car.prototype.viewport = function() {
        var width;
        if (this.options.responsiveBaseElement !== window) {
            width = $(this.options.responsiveBaseElement).width();
        } else if (window.innerWidth) {
            width = window.innerWidth;
        } else if (document.documentElement && document.documentElement.clientWidth) {
            width = document.documentElement.clientWidth;
        } else {
            console.warn('Can not detect viewport width.');
        }
        return width;
    };

    /**
     * Substitui o conteúdo atual.
     * @public
     * @param {HTMLElement|jQuery|String} content - O novo conteúdo.
     */
    car.prototype.replace = function(content) {
        this.$stage.empty();
        this._items = [];

        if (content) {
            content = (content instanceof jQuery) ? content : $(content);
        }

        if (this.settings.nestedItemSelector) {
            content = content.find('.' + this.settings.nestedItemSelector);
        }

        content.filter(function() {
            return this.nodeType === 1;
        }).each($.proxy(function(index, item) {
            item = this.prepare(item);
            this.$stage.append(item);
            this._items.push(item);
            this._mergers.push(item.find('[data-merge]').addBack('[data-merge]').attr('data-merge') * 1 || 1);
        }, this));

        this.reset(this.isNumeric(this.settings.startPosition) ? this.settings.startPosition : 0);

        this.invalidate('items');
    };

    /**
     * Adiciona um item.
     * @todo Use `item` em vez de `conteúdo` para os argumentos do evento.
     * @public
     * @param {HTMLElement|jQuery|String} content - O conteúdo do item a ser adicionado.
     * @param {Number} [position] - A posição relativa na qual inserir o item, caso contrário, o item será adicionado ao final.
     */
    car.prototype.add = function(content, position) {
        var current = this.relative(this._current);

        position = position === undefined ? this._items.length : this.normalize(position, true);
        content = content instanceof jQuery ? content : $(content);

        this.trigger('add', { content: content, position: position });

        content = this.prepare(content);

        if (this._items.length === 0 || position === this._items.length) {
            this._items.length === 0 && this.$stage.append(content);
            this._items.length !== 0 && this._items[position - 1].after(content);
            this._items.push(content);
            this._mergers.push(content.find('[data-merge]').addBack('[data-merge]').attr('data-merge') * 1 || 1);
        } else {
            this._items[position].before(content);
            this._items.splice(position, 0, content);
            this._mergers.splice(position, 0, content.find('[data-merge]').addBack('[data-merge]').attr('data-merge') * 1 || 1);
        }

        this._items[current] && this.reset(this._items[current].index());

        this.invalidate('items');

        this.trigger('added', { content: content, position: position });
    };

    /**
     * Remove um item por sua posição.
     * @todo Use `item` em vez de `conteúdo` para os argumentos do evento.
     * @public
     * @param {Number} position - A posição relativa do item a ser removido.
     */
    car.prototype.remove = function(position) {
        position = this.normalize(position, true);

        if (position === undefined) {
            return;
        }

        this.trigger('remove', { content: this._items[position], position: position });

        this._items[position].remove();
        this._items.splice(position, 1);
        this._mergers.splice(position, 1);

        this.invalidate('items');

        this.trigger('removed', { content: null, position: position });
    };

    /**
     * Pré-carregue imagens com largura automática.
     * @todo Substitua por uma abordagem mais genérica
     * @protected
     */
    car.prototype.preloadAutoWidthImages = function(images) {
        images.each($.proxy(function(i, element) {
            this.enter('pre-loading');
            element = $(element);
            $(new Image()).one('load', $.proxy(function(e) {
                element.attr('src', e.target.src);
                element.css('opacity', 1);
                this.leave('pre-loading');
                !this.is('pre-loading') && !this.is('initializing') && this.refresh();
            }, this)).attr('src', element.attr('src') || element.attr('data-src') || element.attr('data-src-retina'));
        }, this));
    };

    /**
     * Destrói o carrossel.
     * @public
     */
    car.prototype.destroy = function() {

        this.$element.off('.car.core');
        this.$stage.off('.car.core');
        $(document).off('.car.core');

        if (this.settings.responsive !== false) {
            window.clearTimeout(this.resizeTimer);
            this.off(window, 'resize', this._handlers.onThrottledResize);
        }

        for (var i in this._plugins) {
            this._plugins[i].destroy();
        }

        this.$stage.children('.cloned').remove();

        this.$stage.unwrap();
        this.$stage.children().contents().unwrap();
        this.$stage.children().unwrap();
        this.$stage.remove();
        this.$element
            .removeClass(this.options.refreshClass)
            .removeClass(this.options.loadingClass)
            .removeClass(this.options.loadedClass)
            .removeClass(this.options.rtlClass)
            .removeClass(this.options.dragClass)
            .removeClass(this.options.grabClass)
            .attr('class', this.$element.attr('class').replace(new RegExp(this.options.responsiveClass + '-\\S+\\s', 'g'), ''))
            .removeData('car.carousel');
    };

    /**
     * Operadores para calcular da direita para a esquerda e da esquerda para a direita.
     * @protected
     * @param {Number} [a] - O operando do lado esquerdo.
     * @param {String} [o] - O operador.
     * @param {Number} [b] - O operando do lado direito.
     */
    car.prototype.op = function(a, o, b) {
        var rtl = this.settings.rtl;
        switch (o) {
            case '<':
                return rtl ? a > b : a < b;
            case '>':
                return rtl ? a < b : a > b;
            case '>=':
                return rtl ? a <= b : a >= b;
            case '<=':
                return rtl ? a >= b : a <= b;
            default:
                break;
        }
    };

    /**
     * Anexa a um evento interno.
     * @protected
     * @param {HTMLElement} element - A fonte do evento.
     * @param {String} event - O nome do evento.
     * @param {Function} listener - O manipulador de eventos a ser anexado.
     * @param {Boolean} capture - Se o evento deve ser tratado na fase de captura ou não.
     */
    car.prototype.on = function(element, event, listener, capture) {
        if (element.addEventListener) {
            element.addEventListener(event, listener, capture);
        } else if (element.attachEvent) {
            element.attachEvent('on' + event, listener);
        }
    };

    /**
     * Desconecta-se de um evento interno.
     * @protected
     * @param {HTMLElement} element - A fonte do evento.
     * @param {String} event - O nome do evento.
     * @param {Function} listener - O manipulador de eventos anexado para desanexar.
     * @param {Boolean} capture - Se o manipulador de eventos anexado foi registrado como um ouvinte de captura ou não.
     */
    car.prototype.off = function(element, event, listener, capture) {
        if (element.removeEventListener) {
            element.removeEventListener(event, listener, capture);
        } else if (element.detachEvent) {
            element.detachEvent('on' + event, listener);
        }
    };

    /**
     * Aciona um evento público.
     * @todo Remova `status`, `relatedTarget` deve ser usado em seu lugar.
     * @protected
     * @param {String} name - O nome do evento.
     * @param {*} [data=null] - Os dados do evento.
     * @param {String} [namespace=carousel] - O namespace do evento.
     * @param {String} [state] - O estado que está associado ao evento.
     * @param {Boolean} [enter=false] - Indica se a chamada entra no estado especificado ou não.
     * @returns {Event} - Os argumentos do evento.
     */
    car.prototype.trigger = function(name, data, namespace, state, enter) {
        var status = {
                item: { count: this._items.length, index: this.current() }
            },
            handler = $.camelCase(
                $.grep(['on', name, namespace], function(v) { return v })
                .join('-').toLowerCase()
            ),
            event = $.Event(
                [name, 'car', namespace || 'carousel'].join('.').toLowerCase(),
                $.extend({ relatedTarget: this }, status, data)
            );

        if (!this._supress[name]) {
            $.each(this._plugins, function(name, plugin) {
                if (plugin.onTrigger) {
                    plugin.onTrigger(event);
                }
            });

            this.register({ type: car.Type.Event, name: name });
            this.$element.trigger(event);

            if (this.settings && typeof this.settings[handler] === 'function') {
                this.settings[handler].call(this, event);
            }
        }

        return event;
    };

    /**
     * Entra em um estado.
     * @param name - O nome do estado.
     */
    car.prototype.enter = function(name) {
        $.each([name].concat(this._states.tags[name] || []), $.proxy(function(i, name) {
            if (this._states.current[name] === undefined) {
                this._states.current[name] = 0;
            }

            this._states.current[name]++;
        }, this));
    };

    /**
     * Deixa um estado.
     * @param name -O nome do estado.
     */
    car.prototype.leave = function(name) {
        $.each([name].concat(this._states.tags[name] || []), $.proxy(function(i, name) {
            this._states.current[name]--;
        }, this));
    };

    /**
     * Registra um evento ou estado.
     * @public
     * @param {Object} object - O evento ou estado a ser registrado.
     */
    car.prototype.register = function(object) {
        if (object.type === car.Type.Event) {
            if (!$.event.special[object.name]) {
                $.event.special[object.name] = {};
            }

            if (!$.event.special[object.name].car) {
                var _default = $.event.special[object.name]._default;
                $.event.special[object.name]._default = function(e) {
                    if (_default && _default.apply && (!e.namespace || e.namespace.indexOf('car') === -1)) {
                        return _default.apply(this, arguments);
                    }
                    return e.namespace && e.namespace.indexOf('car') > -1;
                };
                $.event.special[object.name].car = true;
            }
        } else if (object.type === car.Type.State) {
            if (!this._states.tags[object.name]) {
                this._states.tags[object.name] = object.tags;
            } else {
                this._states.tags[object.name] = this._states.tags[object.name].concat(object.tags);
            }

            this._states.tags[object.name] = $.grep(this._states.tags[object.name], $.proxy(function(tag, i) {
                return $.inArray(tag, this._states.tags[object.name]) === i;
            }, this));
        }
    };

    /**
     * Suprime eventos.
     * @protected
     * @param {Array.<String>} events - Os eventos a serem suprimidos.
     */
    car.prototype.suppress = function(events) {
        $.each(events, $.proxy(function(index, event) {
            this._supress[event] = true;
        }, this));
    };

    /**
     * Libera eventos suprimidos.
     * @protected
     * @param {Array.<String>} events - Os eventos a serem lançados.
     */
    car.prototype.release = function(events) {
        $.each(events, $.proxy(function(index, event) {
            delete this._supress[event];
        }, this));
    };

    /**
     * Obtém as coordenadas do ponteiro unificado do evento.
     * @todo #261
     * @protected
     * @param {Event} - O evento `mousedown` ou `touchstart`.
     * @returns {Object} - Contém as coordenadas `x` e `y` da posição atual do ponteiro.
     */
    car.prototype.pointer = function(event) {
        var result = { x: null, y: null };

        event = event.originalEvent || event || window.event;

        event = event.touches && event.touches.length ?
            event.touches[0] : event.changedTouches && event.changedTouches.length ?
            event.changedTouches[0] : event;

        if (event.pageX) {
            result.x = event.pageX;
            result.y = event.pageY;
        } else {
            result.x = event.clientX;
            result.y = event.clientY;
        }

        return result;
    };

    /**
     * Determina se a entrada é um número ou algo que pode ser forçado a um número
     * @protected
     * @param {Number|String|Object|Array|Boolean|RegExp|Function|Symbol} - A entrada a ser testada
     * @returns {Boolean} - Uma indicação se a entrada é um número ou pode ser forçada a um número
     */
    car.prototype.isNumeric = function(number) {
        return !isNaN(parseFloat(number));
    };

    /**
     * Obtém a diferença de dois vetores.
     * @todo #261
     * @protected
     * @param {Object} - O primeiro vetor.
     * @param {Object} - O segundo vetor.
     * @returns {Object} - A diferença.
     */
    car.prototype.difference = function(first, second) {
        return {
            x: first.x - second.x,
            y: first.y - second.y
        };
    };

    /**
     * O plugin jQuery para o carrossel do carro
     * @todo Plugin de navegação `next` e `prev`
     * @public
     */
    $.fn.carCarousel = function(option) {
        var args = Array.prototype.slice.call(arguments, 1);

        return this.each(function() {
            var $this = $(this),
                data = $this.data('car.carousel');

            if (!data) {
                data = new car(this, typeof option == 'object' && option);
                $this.data('car.carousel', data);

                $.each([
                    'next', 'prev', 'to', 'destroy', 'refresh', 'replace', 'add', 'remove'
                ], function(i, event) {
                    data.register({ type: car.Type.Event, name: event });
                    data.$element.on(event + '.car.carousel.core', $.proxy(function(e) {
                        if (e.namespace && e.relatedTarget !== this) {
                            this.suppress([event]);
                            data[event].apply(this, [].slice.call(arguments, 1));
                            this.release([event]);
                        }
                    }, data));
                });
            }

            if (typeof option == 'string' && option.charAt(0) !== '_') {
                data[option].apply(data, args);
            }
        });
    };

    /**
     * O construtor para o plugin jQuery
     * @public
     */
    $.fn.carCarousel.Constructor = car;

})(window.Zepto || window.jQuery, window, document);

/**
 * Plug-in de atualização automática
 * @version 2.3.4
 * @author Artus Kolanowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
;
(function($, window, document, undefined) {

    /**
     * Cria o plug-in de atualização automática.
     * @class O plug-in de atualização automática
     * @param {car} carousel - O carrossel do carro
     */
    var AutoRefresh = function(carousel) {
        /**
         * Referência ao núcleo.
         * @protected
         * @type {car}
         */
        this._core = carousel;

        /**
         * Intervalo de atualização.
         * @protected
         * @type {number}
         */
        this._interval = null;

        /**
         * Se o elemento está visível ou não.
         * @protected
         * @type {Boolean}
         */
        this._visible = null;

        /**
         * Todos os manipuladores de eventos.
         * @protected
         * @type {Object}
         */
        this._handlers = {
            'initialized.car.carousel': $.proxy(function(e) {
                if (e.namespace && this._core.settings.autoRefresh) {
                    this.watch();
                }
            }, this)
        };

        // definir opções padrão
        this._core.options = $.extend({}, AutoRefresh.Defaults, this._core.options);

        // registrar manipuladores de eventos
        this._core.$element.on(this._handlers);
    };

    /**
     * Opções padrão.
     * @public
     */
    AutoRefresh.Defaults = {
        autoRefresh: true,
        autoRefreshInterval: 500
    };

    /**
     * Observa o elemento.
     */
    AutoRefresh.prototype.watch = function() {
        if (this._interval) {
            return;
        }

        this._visible = this._core.isVisible();
        this._interval = window.setInterval($.proxy(this.refresh, this), this._core.settings.autoRefreshInterval);
    };

    /**
     * Atualiza o elemento.
     */
    AutoRefresh.prototype.refresh = function() {
        if (this._core.isVisible() === this._visible) {
            return;
        }

        this._visible = !this._visible;

        this._core.$element.toggleClass('car-hidden', !this._visible);

        this._visible && (this._core.invalidate('width') && this._core.refresh());
    };

    /**
     * Destrói o plug-in.
     */
    AutoRefresh.prototype.destroy = function() {
        var handler, property;

        window.clearInterval(this._interval);

        for (handler in this._handlers) {
            this._core.$element.off(handler, this._handlers[handler]);
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    $.fn.carCarousel.Constructor.Plugins.AutoRefresh = AutoRefresh;

})(window.Zepto || window.jQuery, window, document);

/**
 * Lazy Plugin
 * @version 2.3.4
 * @author Bartosz Wojciechowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
;
(function($, window, document, undefined) {

    /**
     * Cria o plugin preguiçoso.
     * @class O plug-in preguiçoso
     * @param {car} carousel - O carrossel do carro
     */
    var Lazy = function(carousel) {

        /**
         * Referência ao núcleo.
         * @protected
         * @type {car}
         */
        this._core = carousel;

        /**
         * Itens já carregados.
         * @protected
         * @type {Array.<jQuery>}
         */
        this._loaded = [];

        /**
         * Manipuladores de eventos.
         * @protected
         * @type {Object}
         */
        this._handlers = {
            'initialized.car.carousel change.car.carousel resized.car.carousel': $.proxy(function(e) {
                if (!e.namespace) {
                    return;
                }

                if (!this._core.settings || !this._core.settings.lazyLoad) {
                    return;
                }

                if ((e.property && e.property.name == 'position') || e.type == 'initialized') {
                    var settings = this._core.settings,
                        n = (settings.center && Math.ceil(settings.items / 2) || settings.items),
                        i = ((settings.center && n * -1) || 0),
                        position = (e.property && e.property.value !== undefined ? e.property.value : this._core.current()) + i,
                        clones = this._core.clones().length,
                        load = $.proxy(function(i, v) { this.load(v) }, this);
                    //TODO: Precisa de documentação para esta nova opção
                    if (settings.lazyLoadEager > 0) {
                        n += settings.lazyLoadEager;
                        // Se o carrossel estiver em loop, também pré-carregue as imagens que estão à "esquerda"
                        if (settings.loop) {
                            position -= settings.lazyLoadEager;
                            n++;
                        }
                    }

                    while (i++ < n) {
                        this.load(clones / 2 + this._core.relative(position));
                        clones && $.each(this._core.clones(this._core.relative(position)), load);
                        position++;
                    }
                }
            }, this)
        };

        // definir as opções padrão
        this._core.options = $.extend({}, Lazy.Defaults, this._core.options);

        // registrar manipulador de eventos
        this._core.$element.on(this._handlers);
    };

    /**
     * Opções padrão.
     * @public
     */
    Lazy.Defaults = {
        lazyLoad: false,
        lazyLoadEager: 0
    };

    /**
     * Carrega todos os recursos de um item na posição especificada.
     * @param {Number} position - A posição absoluta do item.
     * @protected
     */
    Lazy.prototype.load = function(position) {
        var $item = this._core.$stage.children().eq(position),
            $elements = $item && $item.find('.car-lazy');

        if (!$elements || $.inArray($item.get(0), this._loaded) > -1) {
            return;
        }

        $elements.each($.proxy(function(index, element) {
            var $element = $(element),
                image,
                url = (window.devicePixelRatio > 1 && $element.attr('data-src-retina')) || $element.attr('data-src') || $element.attr('data-srcset');

            this._core.trigger('load', { element: $element, url: url }, 'lazy');

            if ($element.is('img')) {
                $element.one('load.car.lazy', $.proxy(function() {
                    $element.css('opacity', 1);
                    this._core.trigger('loaded', { element: $element, url: url }, 'lazy');
                }, this)).attr('src', url);
            } else if ($element.is('source')) {
                $element.one('load.car.lazy', $.proxy(function() {
                    this._core.trigger('loaded', { element: $element, url: url }, 'lazy');
                }, this)).attr('srcset', url);
            } else {
                image = new Image();
                image.onload = $.proxy(function() {
                    $element.css({
                        'background-image': 'url("' + url + '")',
                        'opacity': '1'
                    });
                    this._core.trigger('loaded', { element: $element, url: url }, 'lazy');
                }, this);
                image.src = url;
            }
        }, this));

        this._loaded.push($item.get(0));
    };

    /**
     * Destrói o plug-in.
     * @public
     */
    Lazy.prototype.destroy = function() {
        var handler, property;

        for (handler in this.handlers) {
            this._core.$element.off(handler, this.handlers[handler]);
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    $.fn.carCarousel.Constructor.Plugins.Lazy = Lazy;

})(window.Zepto || window.jQuery, window, document);

/**
 * Plugin AutoHeight
 * @version 2.3.4
 * @author Bartosz Wojciechowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
;
(function($, window, document, undefined) {

    /**
     * Cria o plug-in de altura automática.
     * @class O plug-in de altura automática
     * @param {car} carousel - O carrossel do carro
     */
    var AutoHeight = function(carousel) {
        /**
         * Reference to the core.
         * @protected
         * @type {car}
         */
        this._core = carousel;

        this._previousHeight = null;

        /**
         * Todos os manipuladores de eventos.
         * @protected
         * @type {Object}
         */
        this._handlers = {
            'initialized.car.carousel refreshed.car.carousel': $.proxy(function(e) {
                if (e.namespace && this._core.settings.autoHeight) {
                    this.update();
                }
            }, this),
            'changed.car.carousel': $.proxy(function(e) {
                if (e.namespace && this._core.settings.autoHeight && e.property.name === 'position') {
                    this.update();
                }
            }, this),
            'loaded.car.lazy': $.proxy(function(e) {
                if (e.namespace && this._core.settings.autoHeight &&
                    e.element.closest('.' + this._core.settings.itemClass).index() === this._core.current()) {
                    this.update();
                }
            }, this)
        };

        // definir opções padrão
        this._core.options = $.extend({}, AutoHeight.Defaults, this._core.options);

        // registrar manipuladores de eventos
        this._core.$element.on(this._handlers);
        this._intervalId = null;
        var refThis = this;

        // Essas alterações foram tiradas de um PR por gavroche ignou proposto em #1575 // e foram compatíveis com a versão mais recente do jQuery
        $(window).on('load', function() {
            if (refThis._core.settings.autoHeight) {
                refThis.update();
            }
        });

        // Redimensionar automaticamente a altura do carrossel quando a janela é redimensionada
        // Quando o carrossel tem imagens, a altura depende da largura
        // e também deve mudar no redimensionamento
        $(window).resize(function() {
            if (refThis._core.settings.autoHeight) {
                if (refThis._intervalId != null) {
                    clearTimeout(refThis._intervalId);
                }

                refThis._intervalId = setTimeout(function() {
                    refThis.update();
                }, 250);
            }
        });

    };

    /**
     * Opções padrão.
     * @public
     */
    AutoHeight.Defaults = {
        autoHeight: false,
        autoHeightClass: 'car-height'
    };

    /**
     * Atualiza a visualização.
     */
    AutoHeight.prototype.update = function() {
        var start = this._core._current,
            end = start + this._core.settings.items,
            lazyLoadEnabled = this._core.settings.lazyLoad,
            visible = this._core.$stage.children().toArray().slice(start, end),
            heights = [],
            maxheight = 0;

        $.each(visible, function(index, item) {
            heights.push($(item).height());
        });

        maxheight = Math.max.apply(null, heights);

        if (maxheight <= 1 && lazyLoadEnabled && this._previousHeight) {
            maxheight = this._previousHeight;
        }

        this._previousHeight = maxheight;

        this._core.$stage.parent()
            .height(maxheight)
            .addClass(this._core.settings.autoHeightClass);
    };

    AutoHeight.prototype.destroy = function() {
        var handler, property;

        for (handler in this._handlers) {
            this._core.$element.off(handler, this._handlers[handler]);
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] !== 'function' && (this[property] = null);
        }
    };

    $.fn.carCarousel.Constructor.Plugins.AutoHeight = AutoHeight;

})(window.Zepto || window.jQuery, window, document);

/**
 * Plug-in de vídeo
 * @version 2.3.4
 * @author Bartosz Wojciechowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
;
(function($, window, document, undefined) {

    /**
     *Cria o plug-in de vídeo.
     * @class O plug-in de vídeo
     * @param {car} carousel - O carrossel do carro
     */
    var Video = function(carousel) {
        /**
         * Referência ao núcleo.
         * @protected
         * @type {car}
         */
        this._core = carousel;

        /**
         * Cache de todos os URLs de vídeo.
         * @protected
         * @type {Object}
         */
        this._videos = {};

        /**
         * Item de jogo atual.
         * @protected
         * @type {jQuery}
         */
        this._playing = null;

        /**
         * Todos os manipuladores de eventos.
         * @todo A remoção do conteúdo do clone é tarde demais
         * @protected
         * @type {Object}
         */
        this._handlers = {
            'initialized.car.carousel': $.proxy(function(e) {
                if (e.namespace) {
                    this._core.register({ type: 'state', name: 'playing', tags: ['interacting'] });
                }
            }, this),
            'resize.car.carousel': $.proxy(function(e) {
                if (e.namespace && this._core.settings.video && this.isInFullScreen()) {
                    e.preventDefault();
                }
            }, this),
            'refreshed.car.carousel': $.proxy(function(e) {
                if (e.namespace && this._core.is('resizing')) {
                    this._core.$stage.find('.cloned .car-video-frame').remove();
                }
            }, this),
            'changed.car.carousel': $.proxy(function(e) {
                if (e.namespace && e.property.name === 'position' && this._playing) {
                    this.stop();
                }
            }, this),
            'prepared.car.carousel': $.proxy(function(e) {
                if (!e.namespace) {
                    return;
                }

                var $element = $(e.content).find('.car-video');

                if ($element.length) {
                    $element.css('display', 'none');
                    this.fetch($element, $(e.content));
                }
            }, this)
        };

        // definir opções padrão
        this._core.options = $.extend({}, Video.Defaults, this._core.options);

        // registrar manipuladores de eventos
        this._core.$element.on(this._handlers);

        this._core.$element.on('click.car.video', '.car-video-play-icon', $.proxy(function(e) {
            this.play(e);
        }, this));
    };

    /**
     * Opções padrão.
     * @public
     */
    Video.Defaults = {
        video: false,
        videoHeight: false,
        videoWidth: false
    };

    /**
     * Obtém o ID do vídeo e o tipo (somente YouTube/Vimeo/vzaar).
     * @protected
     * @param {jQuery} target - O destino que contém os dados de vídeo.
     * @param {jQuery} item - O item que contém o vídeo.
     */
    Video.prototype.fetch = function(target, item) {
        var type = (function() {
                if (target.attr('data-vimeo-id')) {
                    return 'vimeo';
                } else if (target.attr('data-vzaar-id')) {
                    return 'vzaar'
                } else {
                    return 'youtube';
                }
            })(),
            id = target.attr('data-vimeo-id') || target.attr('data-youtube-id') || target.attr('data-vzaar-id'),
            width = target.attr('data-width') || this._core.settings.videoWidth,
            height = target.attr('data-height') || this._core.settings.videoHeight,
            url = target.attr('href');

        if (url) {

            /*
            		Parses the id's out of the following urls (and probably more):
            		https://www.youtube.com/watch?v=:id
            		https://youtu.be/:id
            		https://vimeo.com/:id
            		https://vimeo.com/channels/:channel/:id
            		https://vimeo.com/groups/:group/videos/:id
            		https://app.vzaar.com/videos/:id

            		Visual example: https://regexper.com/#(http%3A%7Chttps%3A%7C)%5C%2F%5C%2F(player.%7Cwww.%7Capp.)%3F(vimeo%5C.com%7Cyoutu(be%5C.com%7C%5C.be%7Cbe%5C.googleapis%5C.com)%7Cvzaar%5C.com)%5C%2F(video%5C%2F%7Cvideos%5C%2F%7Cembed%5C%2F%7Cchannels%5C%2F.%2B%5C%2F%7Cgroups%5C%2F.%2B%5C%2F%7Cwatch%5C%3Fv%3D%7Cv%5C%2F)%3F(%5BA-Za-z0-9._%25-%5D*)(%5C%26%5CS%2B)%3F
            */

            id = url.match(/(http:|https:|)\/\/(player.|www.|app.)?(vimeo\.com|youtu(be\.com|\.be|be\.googleapis\.com|be\-nocookie\.com)|vzaar\.com)\/(video\/|videos\/|embed\/|channels\/.+\/|groups\/.+\/|watch\?v=|v\/)?([A-Za-z0-9._%-]*)(\&\S+)?/);

            if (id[3].indexOf('youtu') > -1) {
                type = 'youtube';
            } else if (id[3].indexOf('vimeo') > -1) {
                type = 'vimeo';
            } else if (id[3].indexOf('vzaar') > -1) {
                type = 'vzaar';
            } else {
                throw new Error('Video URL not supported.');
            }
            id = id[6];
        } else {
            throw new Error('Missing video URL.');
        }

        this._videos[url] = {
            type: type,
            id: id,
            width: width,
            height: height
        };

        item.attr('data-video', url);

        this.thumbnail(target, this._videos[url]);
    };

    /**
     * Criar miniatura de vídeo.
     * @protected
     * @param {jQuery} target - O destino que contém os dados de vídeo.
     * @param {Object} info - O objeto de informações de vídeo.
     * @see `fetch`
     */
    Video.prototype.thumbnail = function(target, video) {
        var tnLink,
            icon,
            path,
            dimensions = video.width && video.height ? 'width:' + video.width + 'px;height:' + video.height + 'px;' : '',
            customTn = target.find('img'),
            srcType = 'src',
            lazyClass = '',
            settings = this._core.settings,
            create = function(path) {
                icon = '<div class="car-video-play-icon"></div>';

                if (settings.lazyLoad) {
                    tnLink = $('<div/>', {
                        "class": 'car-video-tn ' + lazyClass,
                        "srcType": path
                    });
                } else {
                    tnLink = $('<div/>', {
                        "class": "car-video-tn",
                        "style": 'opacity:1;background-image:url(' + path + ')'
                    });
                }
                target.after(tnLink);
                target.after(icon);
            };

        // embrulhar conteúdo de vídeo em div car-video-wrapper
        target.wrap($('<div/>', {
            "class": "car-video-wrapper",
            "style": dimensions
        }));

        if (this._core.settings.lazyLoad) {
            srcType = 'data-src';
            lazyClass = 'car-lazy';
        }

        // miniatura personalizada
        if (customTn.length) {
            create(customTn.attr(srcType));
            customTn.remove();
            return false;
        }

        if (video.type === 'youtube') {
            path = "//img.youtube.com/vi/" + video.id + "/hqdefault.jpg";
            create(path);
        } else if (video.type === 'vimeo') {
            $.ajax({
                type: 'GET',
                url: '//vimeo.com/api/v2/video/' + video.id + '.json',
                jsonp: 'callback',
                dataType: 'jsonp',
                success: function(data) {
                    path = data[0].thumbnail_large;
                    create(path);
                }
            });
        } else if (video.type === 'vzaar') {
            $.ajax({
                type: 'GET',
                url: '//vzaar.com/api/videos/' + video.id + '.json',
                jsonp: 'callback',
                dataType: 'jsonp',
                success: function(data) {
                    path = data.framegrab_url;
                    create(path);
                }
            });
        }
    };

    /**
     * Interrompe o vídeo atual.
     * @public
     */
    Video.prototype.stop = function() {
        this._core.trigger('stop', null, 'video');
        this._playing.find('.car-video-frame').remove();
        this._playing.removeClass('car-video-playing');
        this._playing = null;
        this._core.leave('playing');
        this._core.trigger('stopped', null, 'video');
    };

    /**
     * Inicia o vídeo atual.
     * @public
     * @param {Event} event - Os argumentos do evento.
     */
    Video.prototype.play = function(event) {
        var target = $(event.target),
            item = target.closest('.' + this._core.settings.itemClass),
            video = this._videos[item.attr('data-video')],
            width = video.width || '100%',
            height = video.height || this._core.$stage.height(),
            html,
            iframe;

        if (this._playing) {
            return;
        }

        this._core.enter('playing');
        this._core.trigger('play', null, 'video');

        item = this._core.items(this._core.relative(item.index()));

        this._core.reset(item.index());

        html = $('<iframe frameborder="0" allowfullscreen mozallowfullscreen webkitAllowFullScreen ></iframe>');
        html.attr('height', height);
        html.attr('width', width);
        if (video.type === 'youtube') {
            html.attr('src', '//www.youtube.com/embed/' + video.id + '?autoplay=1&rel=0&v=' + video.id);
        } else if (video.type === 'vimeo') {
            html.attr('src', '//player.vimeo.com/video/' + video.id + '?autoplay=1');
        } else if (video.type === 'vzaar') {
            html.attr('src', '//view.vzaar.com/' + video.id + '/player?autoplay=true');
        }

        iframe = $(html).wrap('<div class="car-video-frame" />').insertAfter(item.find('.car-video'));

        this._playing = item.addClass('car-video-playing');
    };

    /**
     * Verifica se um vídeo está atualmente no modo de tela cheia ou não.
     * @todo Estilo ruim porque parece um método somente leitura, mas altera os membros.
     * @protected
     * @returns {Boolean}
     */
    Video.prototype.isInFullScreen = function() {
        var element = document.fullscreenElement || document.mozFullScreenElement ||
            document.webkitFullscreenElement;

        return element && $(element).parent().hasClass('car-video-frame');
    };

    /**
     * Destrói o plug-in.
     */
    Video.prototype.destroy = function() {
        var handler, property;

        this._core.$element.off('click.car.video');

        for (handler in this._handlers) {
            this._core.$element.off(handler, this._handlers[handler]);
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    $.fn.carCarousel.Constructor.Plugins.Video = Video;

})(window.Zepto || window.jQuery, window, document);

/**
 * Plugin Animar
 * @version 2.3.4
 * @author Bartosz Wojciechowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
;
(function($, window, document, undefined) {

    /**
     * Cria o plug-in de animação.
     * @class O plug-in de navegação
     * @param {car} scope - The car Carousel
     */
    var Animate = function(scope) {
        this.core = scope;
        this.core.options = $.extend({}, Animate.Defaults, this.core.options);
        this.swapping = true;
        this.previous = undefined;
        this.next = undefined;

        this.handlers = {
            'change.car.carousel': $.proxy(function(e) {
                if (e.namespace && e.property.name == 'position') {
                    this.previous = this.core.current();
                    this.next = e.property.value;
                }
            }, this),
            'drag.car.carousel dragged.car.carousel translated.car.carousel': $.proxy(function(e) {
                if (e.namespace) {
                    this.swapping = e.type == 'translated';
                }
            }, this),
            'translate.car.carousel': $.proxy(function(e) {
                if (e.namespace && this.swapping && (this.core.options.animateOut || this.core.options.animateIn)) {
                    this.swap();
                }
            }, this)
        };

        this.core.$element.on(this.handlers);
    };

    /**
     * Opções padrão.
     * @public
     */
    Animate.Defaults = {
        animateOut: false,
        animateIn: false
    };

    /**
     * Alterna as classes de animação sempre que uma tradução é iniciada.
     * @protected
     * @returns {Boolean|undefined}
     */
    Animate.prototype.swap = function() {

        if (this.core.settings.items !== 1) {
            return;
        }

        if (!$.support.animation || !$.support.transition) {
            return;
        }

        this.core.speed(0);

        var left,
            clear = $.proxy(this.clear, this),
            previous = this.core.$stage.children().eq(this.previous),
            next = this.core.$stage.children().eq(this.next),
            incoming = this.core.settings.animateIn,
            outgoing = this.core.settings.animateOut;

        if (this.core.current() === this.previous) {
            return;
        }

        if (outgoing) {
            left = this.core.coordinates(this.previous) - this.core.coordinates(this.next);
            previous.one($.support.animation.end, clear)
                .css({ 'left': left + 'px' })
                .addClass('animated car-animated-out')
                .addClass(outgoing);
        }

        if (incoming) {
            next.one($.support.animation.end, clear)
                .addClass('animated car-animated-in')
                .addClass(incoming);
        }
    };

    Animate.prototype.clear = function(e) {
        $(e.target).css({ 'left': '' })
            .removeClass('animated car-animated-out car-animated-in')
            .removeClass(this.core.settings.animateIn)
            .removeClass(this.core.settings.animateOut);
        this.core.onTransitionEnd();
    };

    /**
     * Destrói o plug-in.
     * @public
     */
    Animate.prototype.destroy = function() {
        var handler, property;

        for (handler in this.handlers) {
            this.core.$element.off(handler, this.handlers[handler]);
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    $.fn.carCarousel.Constructor.Plugins.Animate = Animate;

})(window.Zepto || window.jQuery, window, document);

/**
 * Plug-in de reprodução automática
 * @version 2.3.4
 * @author Bartosz Wojciechowski
 * @author Artus Kolanowski
 * @author David Deutsch
 * @author Tom De Caluwé
 * @license The MIT License (MIT)
 */
;
(function($, window, document, undefined) {

    /**
     * Cria o plug-in de reprodução automática.
     * @class O plug-in de reprodução automática
     * @param {car} scope - O carrossel do carro
     */
    var Autoplay = function(carousel) {
        /**
         * Referência ao núcleo.
         * @protected
         * @type {car}
         */
        this._core = carousel;

        /**
         * O ID de tempo limite de reprodução automática.
         * @type {Number}
         */
        this._call = null;

        /**
         * Dependendo do estado do plugin, esta variável contém
         * a hora de início do cronômetro ou o valor atual do cronômetro se for
         * pausado. Como começamos em um estado pausado, inicializamos o cronômetro
         * valor.
         * @type {Number}
         */
        this._time = 0;

        /**
         * Armazena o tempo limite usado atualmente.
         * @type {Number}
         */
        this._timeout = 0;

        /**
         * Indica sempre que a reprodução automática é pausada.
         * @type {Boolean}
         */
        this._paused = true;

        /**
         * Todos os manipuladores de eventos.
         * @protected
         * @type {Object}
         */
        this._handlers = {
            'changed.car.carousel': $.proxy(function(e) {
                if (e.namespace && e.property.name === 'settings') {
                    if (this._core.settings.autoplay) {
                        this.play();
                    } else {
                        this.stop();
                    }
                } else if (e.namespace && e.property.name === 'position' && this._paused) {
                    // Reinicie o temporizador. Este código é acionado quando a posição
                    // do carrossel foi alterado através da interação do usuário.
                    this._time = 0;
                }
            }, this),
            'initialized.car.carousel': $.proxy(function(e) {
                if (e.namespace && this._core.settings.autoplay) {
                    this.play();
                }
            }, this),
            'play.car.autoplay': $.proxy(function(e, t, s) {
                if (e.namespace) {
                    this.play(t, s);
                }
            }, this),
            'stop.car.autoplay': $.proxy(function(e) {
                if (e.namespace) {
                    this.stop();
                }
            }, this),
            'mouseover.car.autoplay': $.proxy(function() {
                if (this._core.settings.autoplayHoverPause && this._core.is('rotating')) {
                    this.pause();
                }
            }, this),
            'mouseleave.car.autoplay': $.proxy(function() {
                if (this._core.settings.autoplayHoverPause && this._core.is('rotating')) {
                    this.play();
                }
            }, this),
            'touchstart.car.core': $.proxy(function() {
                if (this._core.settings.autoplayHoverPause && this._core.is('rotating')) {
                    this.pause();
                }
            }, this),
            'touchend.car.core': $.proxy(function() {
                if (this._core.settings.autoplayHoverPause) {
                    this.play();
                }
            }, this)
        };

        // registrar manipuladores de eventos
        this._core.$element.on(this._handlers);

        // definir opções padrão
        this._core.options = $.extend({}, Autoplay.Defaults, this._core.options);
    };

    /**
     * Opções padrão.
     * @public
     */
    Autoplay.Defaults = {
        autoplay: false,
        autoplayTimeout: 5000,
        autoplayHoverPause: false,
        autoplaySpeed: false
    };

    /**
     * Faça a transição para o próximo slide e defina um tempo limite para a próxima transição.
     * @private
     * @param {Number} [speed] - A velocidade de animação para as animações.
     */
    Autoplay.prototype._next = function(speed) {
        this._call = window.setTimeout(
            $.proxy(this._next, this, speed),
            this._timeout * (Math.round(this.read() / this._timeout) + 1) - this.read()
        );

        if (this._core.is('interacting') || document.hidden) {
            return;
        }
        this._core.next(speed || this._core.settings.autoplaySpeed);
    }

    /**
     * Lê o valor atual do timer quando o timer está tocando.
     * @public
     */
    Autoplay.prototype.read = function() {
        return new Date().getTime() - this._time;
    };

    /**
     * Inicia a reprodução automática.
     * @public
     * @param {Number} [timeout] - O intervalo antes do início da próxima animação.
     * @param {Number} [speed] - A velocidade de animação para as animações.
     */
    Autoplay.prototype.play = function(timeout, speed) {
        var elapsed;

        if (!this._core.is('rotating')) {
            this._core.enter('rotating');
        }

        timeout = timeout || this._core.settings.autoplayTimeout;

        // Calcule o tempo decorrido desde a última transição. Se o carrossel
        // não estava jogando este cálculo resultará em zero.
        elapsed = Math.min(this._time % (this._timeout || timeout), timeout);

        if (this._paused) {
            // Inicie o relógio.
            this._time = this.read();
            this._paused = false;
        } else {
            // Limpe o tempo limite ativo para permitir a substituição.
            window.clearTimeout(this._call);
        }

        // Ajuste a origem do temporizador para corresponder ao novo valor de tempo limite.
        this._time += this.read() % timeout - elapsed;

        this._timeout = timeout;
        this._call = window.setTimeout($.proxy(this._next, this, speed), timeout - elapsed);
    };

    /**
     * Interrompe a reprodução automática.
     * @public
     */
    Autoplay.prototype.stop = function() {
        if (this._core.is('rotating')) {
            // Acerte o relógio.
            this._time = 0;
            this._paused = true;

            window.clearTimeout(this._call);
            this._core.leave('rotating');
        }
    };

    /**
     * Pausa a reprodução automática.
     * @public
     */
    Autoplay.prototype.pause = function() {
        if (this._core.is('rotating') && !this._paused) {
            // Pause o relógio.
            this._time = this.read();
            this._paused = true;

            window.clearTimeout(this._call);
        }
    };

    /**
     * Destrói o plug-in.
     */
    Autoplay.prototype.destroy = function() {
        var handler, property;

        this.stop();

        for (handler in this._handlers) {
            this._core.$element.off(handler, this._handlers[handler]);
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    $.fn.carCarousel.Constructor.Plugins.autoplay = Autoplay;

})(window.Zepto || window.jQuery, window, document);

/**
 * Plug-in de navegação
 * @version 2.3.4
 * @author Artus Kolanowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
;
(function($, window, document, undefined) {
    'use strict';

    /**
     * Cria o plug-in de navegação.
     * @class O plug-in de navegação
     * @param {car} carousel - O carrossel do carro.
     */
    var Navigation = function(carousel) {
        /**
         * Referência ao núcleo.
         * @protected
         * @type {car}
         */
        this._core = carousel;

        /**
         * Indica se o plugin está inicializado ou não.
         * @protected
         * @type {Boolean}
         */
        this._initialized = false;

        /**
         * Os índices de paginação atuais.
         * @protected
         * @type {Array}
         */
        this._pages = [];

        /**
         * Todos os elementos DOM da interface do usuário.
         * @protected
         * @type {Object}
         */
        this._controls = {};

        /**
         * Marcação para um indicador.
         * @protected
         * @type {Array.<String>}
         */
        this._templates = [];

        /**
         * O elemento carrossel.
         * @type {jQuery}
         */
        this.$element = this._core.$element;

        /**
         * Métodos substituídos do carrossel.
         * @protected
         * @type {Object}
         */
        this._overrides = {
            next: this._core.next,
            prev: this._core.prev,
            to: this._core.to
        };

        /**
         * Todos os manipuladores de eventos.
         * @protected
         * @type {Object}
         */
        this._handlers = {
            'prepared.car.carousel': $.proxy(function(e) {
                if (e.namespace && this._core.settings.dotsData) {
                    this._templates.push('<div class="' + this._core.settings.dotClass + '">' +
                        $(e.content).find('[data-dot]').addBack('[data-dot]').attr('data-dot') + '</div>');
                }
            }, this),
            'added.car.carousel': $.proxy(function(e) {
                if (e.namespace && this._core.settings.dotsData) {
                    this._templates.splice(e.position, 0, this._templates.pop());
                }
            }, this),
            'remove.car.carousel': $.proxy(function(e) {
                if (e.namespace && this._core.settings.dotsData) {
                    this._templates.splice(e.position, 1);
                }
            }, this),
            'changed.car.carousel': $.proxy(function(e) {
                if (e.namespace && e.property.name == 'position') {
                    this.draw();
                }
            }, this),
            'initialized.car.carousel': $.proxy(function(e) {
                if (e.namespace && !this._initialized) {
                    this._core.trigger('initialize', null, 'navigation');
                    this.initialize();
                    this.update();
                    this.draw();
                    this._initialized = true;
                    this._core.trigger('initialized', null, 'navigation');
                }
            }, this),
            'refreshed.car.carousel': $.proxy(function(e) {
                if (e.namespace && this._initialized) {
                    this._core.trigger('refresh', null, 'navigation');
                    this.update();
                    this.draw();
                    this._core.trigger('refreshed', null, 'navigation');
                }
            }, this)
        };

        // definir opções padrão
        this._core.options = $.extend({}, Navigation.Defaults, this._core.options);

        // registrar manipuladores de eventos
        this.$element.on(this._handlers);
    };

    /**
     * Opções padrão.
     * @public
     * @todo Renomeie `sileBy` para `navenBy`
     */
    Navigation.Defaults = {
        nav: false,
        navText: [
            '<span aria-label="' + 'Previous' + '">&#x2039;</span>',
            '<span aria-label="' + 'Next' + '">&#x203a;</span>'
        ],
        navSpeed: false,
        navElement: 'button type="button" role="presentation"',
        navContainer: false,
        navContainerClass: 'car-nav',
        navClass: [
            'car-prev',
            'car-next'
        ],
        slideBy: 1,
        dotClass: 'car-dot',
        dotsClass: 'car-dots',
        dots: true,
        dotsEach: false,
        dotsData: false,
        dotsSpeed: false,
        dotsContainer: false
    };

    /**
     * Inicializa o layout do plugin e estende o carrossel.
     * @protected
     */
    Navigation.prototype.initialize = function() {
        var override,
            settings = this._core.settings;

        // criar estrutura DOM para navegação relativa
        this._controls.$relative = (settings.navContainer ? $(settings.navContainer) :
            $('<div>').addClass(settings.navContainerClass).appendTo(this.$element)).addClass('disabled');

        this._controls.$previous = $('<' + settings.navElement + '>')
            .addClass(settings.navClass[0])
            .html(settings.navText[0])
            .prependTo(this._controls.$relative)
            .on('click', $.proxy(function(e) {
                this.prev(settings.navSpeed);
            }, this));
        this._controls.$next = $('<' + settings.navElement + '>')
            .addClass(settings.navClass[1])
            .html(settings.navText[1])
            .appendTo(this._controls.$relative)
            .on('click', $.proxy(function(e) {
                this.next(settings.navSpeed);
            }, this));

        // criar estrutura DOM para navegação absoluta
        if (!settings.dotsData) {
            this._templates = [$('<button role="button">')
                .addClass(settings.dotClass)
                .append($('<span>'))
                .prop('outerHTML')
            ];
        }

        this._controls.$absolute = (settings.dotsContainer ? $(settings.dotsContainer) :
            $('<div>').addClass(settings.dotsClass).appendTo(this.$element)).addClass('disabled');

        this._controls.$absolute.on('click', 'button', $.proxy(function(e) {
            var index = $(e.target).parent().is(this._controls.$absolute) ?
                $(e.target).index() : $(e.target).parent().index();

            e.preventDefault();

            this.to(index, settings.dotsSpeed);
        }, this));

        /*$el.on('focusin', function() {
        	$(document).off(".carousel");

        	$(document).on('keydown.carousel', function(e) {
        		if(e.keyCode == 37) {
        			$el.trigger('prev.car')
        		}
        		if(e.keyCode == 39) {
        			$el.trigger('next.car')
        		}
        	});
        });*/

        // substituir métodos públicos do carrossel
        for (override in this._overrides) {
            this._core[override] = $.proxy(this[override], this);
        }
    };

    /**
     * Destrói o plug-in.
     * @protected
     */
    Navigation.prototype.destroy = function() {
        var handler, control, property, override, settings;
        settings = this._core.settings;

        for (handler in this._handlers) {
            this.$element.off(handler, this._handlers[handler]);
        }
        for (control in this._controls) {
            if (control === '$relative' && settings.navContainer) {
                this._controls[control].html('');
            } else {
                this._controls[control].remove();
            }
        }
        for (override in this.overides) {
            this._core[override] = this._overrides[override];
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    /**
     * Atualiza o estado interno.
     * @protected
     */
    Navigation.prototype.update = function() {
        var i, j, k,
            lower = this._core.clones().length / 2,
            upper = lower + this._core.items().length,
            maximum = this._core.maximum(true),
            settings = this._core.settings,
            size = settings.center || settings.autoWidth || settings.dotsData ?
            1 : settings.dotsEach || settings.items;

        if (settings.slideBy !== 'page') {
            settings.slideBy = Math.min(settings.slideBy, settings.items);
        }

        if (settings.dots || settings.slideBy == 'page') {
            this._pages = [];

            for (i = lower, j = 0, k = 0; i < upper; i++) {
                if (j >= size || j === 0) {
                    this._pages.push({
                        start: Math.min(maximum, i - lower),
                        end: i - lower + size - 1
                    });
                    if (Math.min(maximum, i - lower) === maximum) {
                        break;
                    }
                    j = 0, ++k;
                }
                j += this._core.mergers(this._core.relative(i));
            }
        }
    };

    /**
     * Desenha a interface do usuário.
     * @todo A opção `dotsData` não funcionará.
     * @protected
     */
    Navigation.prototype.draw = function() {
        var difference,
            settings = this._core.settings,
            disabled = this._core.items().length <= settings.items,
            index = this._core.relative(this._core.current()),
            loop = settings.loop || settings.rewind;

        this._controls.$relative.toggleClass('disabled', !settings.nav || disabled);

        if (settings.nav) {
            this._controls.$previous.toggleClass('disabled', !loop && index <= this._core.minimum(true));
            this._controls.$next.toggleClass('disabled', !loop && index >= this._core.maximum(true));
        }

        this._controls.$absolute.toggleClass('disabled', !settings.dots || disabled);

        if (settings.dots) {
            difference = this._pages.length - this._controls.$absolute.children().length;

            if (settings.dotsData && difference !== 0) {
                this._controls.$absolute.html(this._templates.join(''));
            } else if (difference > 0) {
                this._controls.$absolute.append(new Array(difference + 1).join(this._templates[0]));
            } else if (difference < 0) {
                this._controls.$absolute.children().slice(difference).remove();
            }

            this._controls.$absolute.find('.active').removeClass('active');
            this._controls.$absolute.children().eq($.inArray(this.current(), this._pages)).addClass('active');
        }
    };

    /**
     * Estende os dados do evento.
     * @protected
     * @param {Event} event - O objeto de evento que é lançado.
     */
    Navigation.prototype.onTrigger = function(event) {
        var settings = this._core.settings;

        event.page = {
            index: $.inArray(this.current(), this._pages),
            count: this._pages.length,
            size: settings && (settings.center || settings.autoWidth || settings.dotsData ?
                1 : settings.dotsEach || settings.items)
        };
    };

    /**
     * Obtém a posição da página atual do carrossel.
     * @protected
     * @returns {Number}
     */
    Navigation.prototype.current = function() {
        var current = this._core.relative(this._core.current());
        return $.grep(this._pages, $.proxy(function(page, index) {
            return page.start <= current && page.end >= current;
        }, this)).pop();
    };

    /**
     * Obtém a posição atual do sucessor/antecessor.
     * @protected
     * @returns {Number}
     */
    Navigation.prototype.getPosition = function(successor) {
        var position, length,
            settings = this._core.settings;

        if (settings.slideBy == 'page') {
            position = $.inArray(this.current(), this._pages);
            length = this._pages.length;
            successor ? ++position : --position;
            position = this._pages[((position % length) + length) % length].start;
        } else {
            position = this._core.relative(this._core.current());
            length = this._core.items().length;
            successor ? position += settings.slideBy : position -= settings.slideBy;
        }

        return position;
    };

    /**
     * Desliza para o próximo item ou página.
     * @public
     * @param {Number} [speed=false] - O tempo em milissegundos para a transição.
     */
    Navigation.prototype.next = function(speed) {
        $.proxy(this._overrides.to, this._core)(this.getPosition(true), speed);
    };

    /**
     * Desliza para o item ou página anterior.
     * @public
     * @param {Number} [speed=false] - O tempo em milissegundos para a transição.
     */
    Navigation.prototype.prev = function(speed) {
        $.proxy(this._overrides.to, this._core)(this.getPosition(false), speed);
    };

    /**
     * Desliza para o item ou página especificada.
     * @public
     * @param {Number} position - A posição do item ou página.
     * @param {Number} [speed] - O tempo em milissegundos para a transição.
     * @param {Boolean} [standard=false] - Se deve usar o comportamento padrão ou não.
     */
    Navigation.prototype.to = function(position, speed, standard) {
        var length;

        if (!standard && this._pages.length) {
            length = this._pages.length;
            $.proxy(this._overrides.to, this._core)(this._pages[((position % length) + length) % length].start, speed);
        } else {
            $.proxy(this._overrides.to, this._core)(position, speed);
        }
    };

    $.fn.carCarousel.Constructor.Plugins.Navigation = Navigation;

})(window.Zepto || window.jQuery, window, document);

/**
 * Plug-in de hash
 * @version 2.3.4
 * @author Artus Kolanowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
;
(function($, window, document, undefined) {
    'use strict';

    /**
     * Cria o plug-in de hash.
     * @class O plug-in de hash
     * @param {car} carousel - O carrossel do carro
     */
    var Hash = function(carousel) {
        /**
         * Referência ao núcleo.
         * @protected
         * @type {car}
         */
        this._core = carousel;

        /**
         * Índice de hash para os itens.
         * @protected
         * @type {Object}
         */
        this._hashes = {};

        /**
         * O elemento carrossel.
         * @type {jQuery}
         */
        this.$element = this._core.$element;

        /**
         * Todos os manipuladores de eventos.
         * @protected
         * @type {Object}
         */
        this._handlers = {
            'initialized.car.carousel': $.proxy(function(e) {
                if (e.namespace && this._core.settings.startPosition === 'URLHash') {
                    $(window).trigger('hashchange.car.navigation');
                }
            }, this),
            'prepared.car.carousel': $.proxy(function(e) {
                if (e.namespace) {
                    var hash = $(e.content).find('[data-hash]').addBack('[data-hash]').attr('data-hash');

                    if (!hash) {
                        return;
                    }

                    this._hashes[hash] = e.content;
                }
            }, this),
            'changed.car.carousel': $.proxy(function(e) {
                if (e.namespace && e.property.name === 'position') {
                    var current = this._core.items(this._core.relative(this._core.current())),
                        hash = $.map(this._hashes, function(item, hash) {
                            return item === current ? hash : null;
                        }).join();

                    if (!hash || window.location.hash.slice(1) === hash) {
                        return;
                    }

                    window.location.hash = hash;
                }
            }, this)
        };

        // definir opções padrão
        this._core.options = $.extend({}, Hash.Defaults, this._core.options);

        // registrar os manipuladores de eventos
        this.$element.on(this._handlers);

        // registrar ouvinte de evento para navegação de hash
        $(window).on('hashchange.car.navigation', $.proxy(function(e) {
            var hash = window.location.hash.substring(1),
                items = this._core.$stage.children(),
                position = this._hashes[hash] && items.index(this._hashes[hash]);

            if (position === undefined || position === this._core.current()) {
                return;
            }

            this._core.to(this._core.relative(position), false, true);
        }, this));
    };

    /**
     * Opções padrão.
     * @public
     */
    Hash.Defaults = {
        URLhashListener: false
    };

    /**
     * Destrói o plug-in.
     * @public
     */
    Hash.prototype.destroy = function() {
        var handler, property;

        $(window).off('hashchange.car.navigation');

        for (handler in this._handlers) {
            this._core.$element.off(handler, this._handlers[handler]);
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    $.fn.carCarousel.Constructor.Plugins.Hash = Hash;

})(window.Zepto || window.jQuery, window, document);

/**
 * Plug-in de suporte
 *
 * @version 2.3.4
 * @author Vivid Planet Software GmbH
 * @author Artus Kolanowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
;
(function($, window, document, undefined) {

    var style = $('<support>').get(0).style,
        prefixes = 'Webkit Moz O ms'.split(' '),
        events = {
            transition: {
                end: {
                    WebkitTransition: 'webkitTransitionEnd',
                    MozTransition: 'transitionend',
                    OTransition: 'oTransitionEnd',
                    transition: 'transitionend'
                }
            },
            animation: {
                end: {
                    WebkitAnimation: 'webkitAnimationEnd',
                    MozAnimation: 'animationend',
                    OAnimation: 'oAnimationEnd',
                    animation: 'animationend'
                }
            }
        },
        tests = {
            csstransforms: function() {
                return !!test('transform');
            },
            csstransforms3d: function() {
                return !!test('perspective');
            },
            csstransitions: function() {
                return !!test('transition');
            },
            cssanimations: function() {
                return !!test('animation');
            }
        };

    function test(property, prefixed) {
        var result = false,
            upper = property.charAt(0).toUpperCase() + property.slice(1);

        $.each((property + ' ' + prefixes.join(upper + ' ') + upper).split(' '), function(i, property) {
            if (style[property] !== undefined) {
                result = prefixed ? property : true;
                return false;
            }
        });

        return result;
    }

    function prefixed(property) {
        return test(property, true);
    }

    if (tests.csstransitions()) {
        /* jshint -W053 */
        $.support.transition = new String(prefixed('transition'))
        $.support.transition.end = events.transition.end[$.support.transition];
    }

    if (tests.cssanimations()) {
        /* jshint -W053 */
        $.support.animation = new String(prefixed('animation'))
        $.support.animation.end = events.animation.end[$.support.animation];
    }

    if (tests.csstransforms()) {
        /* jshint -W053 */
        $.support.transform = new String(prefixed('transform'));
        $.support.transform3d = tests.csstransforms3d();
    }

})(window.Zepto || window.jQuery, window, document);
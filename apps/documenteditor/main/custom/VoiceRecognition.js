/**
 *    VocieRecognition.js
 *
 *    Created by Anderson Martiniano on 23 Abril 2019
 *    Copyright (c) 2019 Nuclearis LTDA. All rights reserved.
 *
 */

define([
    'jquery',
    'underscore',
    'backbone',
    'gateway',
    'common/main/lib/util/Shortcuts'
], function ($, _, Backbone, gateway) {
    Common.VoiceRecognition = new (function() {
        var me = this;
        var _mainController = null;
        var _recognition = null;
        var _started = false;
        var _first = true;
        var _lastNewLine = true;
        var _autorestartCount = 0;
        var _lastStartedAt = null;
        var _paraRunInitialPosition = 0;
        var _paraRunFinalPosition = 0;
        var _keyReplaces = [];
        var _timeOut;
        var _errorAlert = false;
        var _keyReplacesDefault = [
          // Parágrafo
          { key: /parágrafo/ig, value: '{$}paragraph{$}'},
          { key: /paragrafo/ig, value: '{$}paragraph{$}'},
          { key: /Parágrafo/ig, value: '{$}paragraph{$}'},
          { key: /Paragrafo/ig, value: '{$}paragraph{$}'},
      
          // Nova Linha
          { key: /nova linha /ig, value: '{$}newLine{$}'},
          { key: /nova linha/ig, value: '{$}newLine{$}'},
          { key: /Nova linha /ig, value: '{$}newLine{$}'},
          { key: /Nova linha/ig, value: '{$}newLine{$}'},
      
          // Ponto e Vírgula
          { key: / ponto e virgula/ig, value: ';'},
          { key: /ponto e virgula/ig, value: ';'},
          { key: / ponto e vírgula/ig, value: ';'},
          { key: /ponto e vírgula/ig, value: ';'},
          { key: / ponto e,/ig, value: ';'},
          { key: /ponto e,/ig, value: ';'},
      
          // Dois Pontos
          { key: / 2 pontos/ig, value: ':'},
          { key: /2 pontos/ig, value: ':'},
          { key: / dois pontos/ig, value: ':'},
          { key: /dois pontos/ig, value: ':'},
      
          // Ponto
          { key: / pontos/ig, value: '.'},
          { key: /pontos/ig, value: '.'},
          { key: / ponto/ig, value: '.'},
          { key: /ponto/ig, value: '.'},
          { key: / punto/ig, value: '.'},
          { key: /punto/ig, value: '.'},
          { key: / Ponto/ig, value: '.'},
          { key: /Ponto/ig, value: '.'},
      
          // Virgula
          { key: / virgula/ig, value: ','},
          { key: /virgula/ig, value: ','},
          { key: / vírgula/ig, value: ','},
          { key: /vírgula/ig, value: ','},
      
          // Abre e fecha Parênteses
          { key: /abre parênteses/ig, value: '('},
          { key: /abre parenteses/ig, value: '('},
          { key: /abre parêntese/ig, value: '('},
          { key: /abre parentese/ig, value: '('},
          { key: /fecha parênteses/ig, value: ')'},
          { key: /fecha parenteses/ig, value: ')'},
          { key: /fecha parêntese/ig, value: ')'},
          { key: /fecha parentese/ig, value: ')'},
      
          // Asteristico
          { key: /asterisco/ig, value: '*'},
      
          // Traço
          { key: /traço/ig, value: '-'},
      
          // Barra e contra barra
          { key: /barra/ig, value: '/'},
          { key: /barra/ig, value: '/'},
          { key: /contra-barra/ig, value: '\\'},
          { key: /contra barra/ig, value: '\\'},
      
          // Palavras Médicas
          { key: /c\*\*\*\*/ig, value: 'corno'},
        ];

        var reset = function() {
            me._recognition = null;
            me._started = null;
            me._first = true;
        };

        var onInit = function(loadConfig) {

            if(_mainController == null){
                try { _mainController = DE.getController('Main'); } catch(e) {
                    try { _mainController = PE.getController('Main'); } catch(e) {
                        try { _mainController =  SSE.getController('Main'); } catch(e) {}
                    }
                }
            }

            if(loadConfig.config.mode == "edit"){
              configureVoiceRecognitionButton();
            }
        };

        var configureVoiceRecognitionButton = function(){
            var leftMenuView = DE.getController('LeftMenu').getView('LeftMenu');
            leftMenuView.$el.find('.tool-menu-btns:last').append('<button id="left-btn-complete-voice-recognition" class="btn btn-category"><span class="btn-icon img-toolbarmenu" style="background-position: var(--bgX) -1401px">&nbsp;</span></button>');
            //statusbarView.$el.find('.tool-menu-btns:last').prepend('<div class="separator short el-edit"></div>');
            
            leftMenuView.btnVoiceRecognition = new Common.UI.Button({
                el: $('#left-btn-complete-voice-recognition',leftMenuView.el),
                enableToggle: true,
                disabled: true,
                hint: "Habilita ou Desabilita o reconhecimento de voz (alt+s)"
            });

            leftMenuView.$el.find('#left-btn-complete-voice-recognition span').css('background-image', "url('./resources/img/rec.png'");
            leftMenuView.$el.find('#left-btn-complete-voice-recognition span').css('background-position', "center center");
            leftMenuView.$el.find('#left-btn-complete-voice-recognition span').css('background-size', "14px 14px");

            leftMenuView.btnVoiceRecognition.on('click', function() {
              toggle();
              leftMenuView.btnVoiceRecognition.toggle(false, true);
            });
        };

        var toggle = function() {
          if(!(Common.Utils.isChrome && Common.Utils.chromeVersion >= 64)){
            var config = {
              closable: false,
              title: "Recurso indisponível",
              msg: "Este recurso requer o navegador Google Chrome na versão 64 ou superior",
              iconCls: 'alert',
              buttons: ['ok']
            };
          
            Common.UI.alert(config);
            //btnVoiceRecognition.toggle(false, true);
            return;
          }

          initSpeechRecognition()
          if (_started)
            stopListen();
          else
            startListen();
        };
        
        var startListen = function() {
            _recognition.start();
            _started = true;
            _lastStartedAt = new Date().getTime();
        };
        
        var stopListen = function() {
            _recognition.stop();
            _started = false;
            clearTimeout(_timeOut);
        };

        var initSpeechRecognition = function(){
            if(_recognition == null){
                _started = false;
                _recognition = new webkitSpeechRecognition();
                _recognition.continuous = true;
                _recognition.interimResults = true;
                _recognition.lang = "pt-BR";
            
                _recognition.onstart = function () {
                    console.log('On start');
                    _mainController.getApplication().getController('Statusbar').setStatusCaption("Ouvindo...");
                    updateIcon("ATIVADO");
                };

                _recognition.onend = function (event) {
                    _mainController.getApplication().getController('Statusbar').setStatusCaption("");
                    updateIcon("DESATIVADO");
                    if(_started){
                      restartVoiceRecognition();
                    }
                };
            
                _recognition.onresult = function (event) {
                    console.log('Result Recognition', event);
                    writeTranscriptedText(event);
                };

                _recognition.onerror = function(event){
                  console.error("onerror", event);

                  if(!_errorAlert){
                    var config = {
                      closable: false,
                      title: "Erro ativar reconhecimento de voz.",
                      msg: event.error+" - O reconhecimento de voz necessita de acesso seguro (https) - consulte o adminstrador do sistema.",
                      iconCls: 'alert',
                      buttons: ['ok']
                    };
                  
                    _errorAlert = Common.UI.alert(config);
                    _errorAlert = true;
                    stopListen();
                  }
								}

                _keyReplaces = Object.assign([], _keyReplacesDefault);
            }
        }

        var restartVoiceRecognition = function (reason) {
          //console.log('restartVoiceRecognition');
          // play nicely with the browser, and never restart annyang automatically more than once per second
          var timeSinceLastStart = new Date().getTime() - _lastStartedAt;
          _autorestartCount += 1;
          if (_autorestartCount % 10 === 0) {
            console.warn('Speech Recognition is repeatedly stopping and starting.maybe you have two windows with speech recognition open?');
            if (reason === 'network') {
              alert('A network error occured. Please reconnect and refresh the browser');
            }
          }
        
          if (timeSinceLastStart < 1000) {
            _timeOut = setTimeout(function () {
              startListen();
            }, 1000 - timeSinceLastStart);
          } else {
            startListen();
          }
        }

        var updateIcon = function(status) {
          var leftMenuView = DE.getController('LeftMenu').getView('LeftMenu');
          switch(status.toUpperCase()) {
            case "ATIVADO":
              leftMenuView.$el.find('#left-btn-complete-voice-recognition span').css('background-image', "url('./resources/img/rec-enable.gif')");
              leftMenuView.$el.find('#left-btn-complete-voice-recognition span').css('background-position', "center center");
              leftMenuView.$el.find('#left-btn-complete-voice-recognition span').css('background-size', "14px 14px");
              break;
            case "DESATIVADO":
              leftMenuView.$el.find('#left-btn-complete-voice-recognition span').css('background-image', "url('./resources/img/rec.png')");
              leftMenuView.$el.find('#left-btn-complete-voice-recognition span').css('background-position', "center center");
              leftMenuView.$el.find('#left-btn-complete-voice-recognition span').css('background-size', "14px 14px");  
               break;
            case "OUVINDO":
              leftMenuView.$el.find('#left-btn-complete-voice-recognition span').css('background-image', "url('./resources/img/rec-speak.gif')");
              leftMenuView.$el.find('#left-btn-complete-voice-recognition span').css('background-position', "center center");
              leftMenuView.$el.find('#left-btn-complete-voice-recognition span').css('background-size', "14px 14px");  
              break;
          }
        };

        var replaceAll = function(str, token, newtoken) {
	        while (str.indexOf(token) != -1)
	            str = str.replace(token, newtoken);

	        return str;
	      }

        var writeTranscriptedText = function(event){
            var logicalDocument = _mainController.api.WordControl.m_oLogicDocument;
            var paraRun = logicalDocument.Get_DocumentPositionInfoForCollaborative();
            var texto = "";
            var textoTemp = "";
        
            if (event.results === undefined) return;
        
            for (var i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                texto += event.results[i][0].transcript;
                texto = replaceAll(texto, '\n', 'nova linha');
                _keyReplaces.forEach(function (item) {
                  texto = texto.replace(item.key, item.value);
                });
              } else {
                if(_first) {
                  updateIcon("OUVINDO");
                  _first = false;
                  _paraRunInitialPosition = paraRun.Position;
                  _paraRunFinalPosition = _paraRunInitialPosition;
                }

                textoTemp += event.results[i][0].transcript;
                textoTemp = replaceAll(textoTemp, '\n', 'nova linha');
                //console.log(textoTemp);
                paraRun.Class.Remove_FromContent(_paraRunInitialPosition, _paraRunFinalPosition, true);
                paraRun.Class.AddText(textoTemp, _paraRunInitialPosition);
                paraRun.Class.MoveCursorToEndPos(false);
                _paraRunFinalPosition = textoTemp.length;
                
                logicalDocument.Recalculate();
              }
            }

            //console.log(texto);
            //_mainController.api.nuclearis_InsertText(texto);
        
            if (!texto) return;
        
            updateIcon("ATIVADO");
            if(_lastNewLine){
              if(texto.substring(0,1) === " ")
                texto = texto.substring(1,texto.length);
            }
        
            var pontoNewText = '';
            const pontoSplit = texto.split('.');
            if(pontoSplit.length > 2) {
              for (var i = 0; i < pontoSplit.length; i++) {
                var text = pontoSplit[i];
        
                if (i === 0)
                  pontoNewText = text;
                else if (text[0] === ' ' && text[0] !== undefined)
                  text = '. ' + text[1].toUpperCase() + text.substring(2, text.length).toString();
                else if (text[0] !== ' ' && text[0] !== undefined)
                  text = '.' + text[0].toUpperCase() + text.substring(1, text.length).toString();
        
                if (i > 0)
                  pontoNewText += text;
              }
        
              texto = pontoNewText;
            }
        
            var textoArray = texto.split('{$}');
            paraRun.Class.Remove_FromContent(_paraRunInitialPosition, _paraRunFinalPosition, true);
            for(var i=0; i < textoArray.length; i++){
              var param = textoArray[i];
              if(param === 'paragraph') {
               logicalDocument.AddNewParagraph(true, true);
               paraRun = logicalDocument.Get_DocumentPositionInfoForCollaborative();
              }else if(param === 'newLine') {
                _mainController.api.nuclearis_AddLineBreak();
                paraRun = logicalDocument.Get_DocumentPositionInfoForCollaborative();
              }else {
                if(param.length > 0){
                  paraRun.Class.AddText(param);
                  paraRun.Class.MoveCursorToEndPos(false);
                }

                //Retira o espaço em branco do Inicio do Paragrafo
                if(paraRun.Class.Content.length > 0 && paraRun.Class.Content[0].Type == AscCommonWord.ParaSpace.prototype.Get_Type()){
                  paraRun.Class.Remove_FromContent(0, 1, true);
                  paraRun.Class.MoveCursorToEndPos(false);
                }

                //Altera primeira letra para maiusculo
                if(paraRun.Class.Content.length > 0 && paraRun.Class.Content[0].Type == AscCommonWord.ParaText.prototype.Get_Type()){
                  var letter = String.fromCharCode(paraRun.Class.Content[0].Value);
                  paraRun.Class.Remove_FromContent(0, 1, true);
                  paraRun.Class.AddText(letter.toUpperCase(), 0);
                  paraRun.Class.MoveCursorToEndPos(false);
                }
              }
        
              logicalDocument.Recalculate();
            }
            
        
            _first = true;

            if(textoArray[textoArray.length-1] === "" && textoArray[textoArray.length-2] === "newLine")
              _lastNewLine = true;
            else
              _lastNewLine = false;
        
        }

        Common.Gateway.on('init', onInit);


        Common.util.Shortcuts.delegateShortcuts({
          shortcuts: {
              'alt+s': _.bind(function (e) {
                  e.preventDefault();
                  e.stopPropagation();
                  toggle();
              }, this)
          }
        });

        return {
            recognition: _recognition
        };
        
    })();
});
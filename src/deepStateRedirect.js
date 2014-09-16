var ignoreDsr;
function resetIgnoreDsr() {
  ignoreDsr = undefined;
}

// Decorate $state.transitionTo to gain access to the last transition.options variable.
// This is used to process the options.ignoreDsr option
angular.module("ct.ui.router.extras").config([ "$provide", function ($provide) {
  var $state_transitionTo;
  $provide.decorator("$state", ['$delegate', '$q', function ($state, $q) {
    $state_transitionTo = $state.transitionTo;
    $state.transitionTo = function (to, toParams, options) {
      if (options.ignoreDsr) {
        ignoreDsr = options.ignoreDsr;
      }

      return $state_transitionTo.apply($state, arguments).then(
        function (result) {
          resetIgnoreDsr();
          return result;
        },
        function (err) {
          resetIgnoreDsr();
          return $q.reject(err);
        }
      );
    };
    return $state;
  }]);
}]);

angular.module("ct.ui.router.extras").service("$deepStateRedirect", [ '$rootScope', '$state', '$injector', function ($rootScope, $state, $injector) {
  var lastSubstate = {};
  var lastParams = {};
  var deepStateRedirectsByName = {};

  var REDIRECT = "Redirect", ANCESTOR_REDIRECT = "AncestorRedirect";

  function computeDeepStateStatus(state, stateParams) {
    var name = state.name;
    if (deepStateRedirectsByName.hasOwnProperty(name)) {
      if (state.deepStateRedirectParam) {
        if (deepStateRedirectsByName[name].hasOwnProperty( stateParams[state.deepStateRedirectParam] )) {
          return deepStateRedirectsByName[name][stateParams[state.deepStateRedirectParam]];
        } else {
          recordDeepStateRedirectStatus(name, stateParams);
        }
      } else {
        return deepStateRedirectsByName[name];
      }
    }
    recordDeepStateRedirectStatus(name, stateParams);
  }


  function recordDeepStateRedirectStatus(stateName, stateParams) {
    var state = $state.get(stateName);
    if (state && state.deepStateRedirect) {
      if (!deepStateRedirectsByName[stateName])
        deepStateRedirectsByName[stateName] = {};
      if (state.deepStateRedirectParam)
        deepStateRedirectsByName[stateName][stateParams[state.deepStateRedirectParam]] = REDIRECT;
      else
        deepStateRedirectsByName[stateName] = REDIRECT;
      if (lastSubstate[stateName] === undefined) {
          lastSubstate[stateName] = {};
          lastSubstate[stateName][ stateParams[state.deepStateRedirectParam]] = stateName;
      }
    }

    var lastDot = stateName.lastIndexOf(".");
    if (lastDot != -1) {
      var parentStatus = recordDeepStateRedirectStatus(stateName.substr(0, lastDot), stateParams);
      if (state.deepStateRedirectParam) {
        if (parentStatus && deepStateRedirectsByName[stateName][stateParams[state.deepStateRedirectParam]] === undefined) {
          deepStateRedirectsByName[stateName] = {};
          deepStateRedirectsByName[stateName][stateParams[state.deepStateRedirectParam]] = ANCESTOR_REDIRECT;
        }
      } else {
        if (parentStatus && deepStateRedirectsByName[stateName] === undefined) {
          deepStateRedirectsByName[stateName] = {};
          deepStateRedirectsByName[stateName] = ANCESTOR_REDIRECT;
        }
      }
      if (parentStatus && deepStateRedirectsByName[stateName] === undefined) {
        deepStateRedirectsByName[stateName] = ANCESTOR_REDIRECT;
      }
    }
    if (state.deepStateRedirectParam)
      return deepStateRedirectsByName[stateName][stateParams[state.deepStateRedirectParam]] || false;
    else
      return deepStateRedirectsByName[stateName] || false;
  }

  $rootScope.$on("$stateChangeStart", function (event, toState, toParams, fromState, fromParams) {
    function shouldRedirect() {
      if (ignoreDsr) return false;

      var deepStateStatus = computeDeepStateStatus(toState, toParams);
      var substate;
      if (toState.deepStateRedirectParam) {
        substate = lastSubstate[toState.name][toParams[toState.deepStateRedirectParam]];
      } else {
        substate = lastSubstate[toState.name];
      }
      // We're changing directly to one of the redirect (tab) states and we have a last substate recorded
      var isDSR = (deepStateStatus === REDIRECT && substate && substate != toState.name ? true : false);
      if (isDSR && angular.isFunction(toState.deepStateRedirect))
        return $injector.invoke(toState.deepStateRedirect, toState);
  //    console.log("redirect", isDSR);
      return isDSR;
    }

    if (shouldRedirect()) { // send them to the last known state for that tab
      event.preventDefault();
      if (toState.deepStateRedirectParam) {
        $state.go(lastSubstate[toState.name][toParams[toState.deepStateRedirectParam]], lastParams[toState.name][toParams[toState.deepStateRedirectParam]]);
      } else {
        $state.go(lastSubstate[toState.name], lastParams[toState.name]);
      }
    }
  });

  $rootScope.$on("$stateChangeSuccess", function (event, toState, toParams, fromState, fromParams) {
    var deepStateStatus = computeDeepStateStatus(toState, toParams);
    if (deepStateStatus) {
      var name = toState.name;
      angular.forEach(lastSubstate, function (deepState, redirectState) {
        if (name == redirectState || name.indexOf(redirectState + ".") != -1) {
          //TODO "&& !lastSubstate[redirectState].hasOwnProperty('undefined')" is only necessary for not breaking existing texts.
          //TODO while testing, there might be objects like :  Object{undefined: 'top.inv'} or  Object{undefined: 'top.inv'}
          if (toState.deepStateRedirectParam || (angular.isObject(lastSubstate[redirectState]) && !lastSubstate[redirectState].hasOwnProperty('undefined') )) {
              if (!lastSubstate[redirectState])
                lastSubstate[redirectState] = {};
              if (!lastParams[redirectState])
                lastParams[redirectState] = {};

              var parametername = $state.get(redirectState).deepStateRedirectParam;
              lastSubstate[redirectState][toParams[parametername]] = name;
              lastParams[redirectState][toParams[parametername]] = angular.copy(toParams);
          } else {
              lastSubstate[redirectState] = name;
              lastParams[redirectState] = angular.copy(toParams);
          }
        }
      });
    }
  });

  return {};
}]);

angular.module("ct.ui.router.extras").run(['$deepStateRedirect', function ($deepStateRedirect) {
  // Make sure $deepStateRedirect is instantiated
}]);

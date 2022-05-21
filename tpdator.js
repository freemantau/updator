
import * as sys from "@sys"; 
import * as env from "@env";



//xml升级文件 UpdateList.xml
var _entryfile;

//入口exe
var _entrypoint;

//服务器xml地址
var _xmlurl = null;


//本地版本
var _version_l = null;
//服务器版本
var _version_s = null;

//xml本地
var _xmldoc_l;
//xml服务器
var _xmldoc_s;

//下载URL
var _download_path;


// 文件列表
var _downlist;
var _dellist;

// 临时文件夹
var _tmpfold;

const parsexml = function(filebuff)
{
    let stxml = String.fromCharCode.apply(null,new Uint16Array(filebuff));
    let xmldoc = document.createElement("","",null);
    xmldoc.content(stxml);
    return xmldoc; 
}
export const tpdater = function ()
{
    async function doit(lxml,start,pone,pall,complete,error)
    {
        _entryfile = lxml;
        _tmpfold = await sys.fs.mkdtemp("__XXXXXX");
        _tmpfold = env.home() + "/" + _tmpfold + "/";
        let localfile = sys.fs.readfile(lxml)
        //local xml
        .then((buff)=>{
            return _localxml(parsexml(buff));
        })
        //download server xml
        .then((localxml)=>{
            return fetch(_xmlurl + _entryfile ,{method:"GET"}).then((res)=>{
                if(res.ok){
                    return res.arrayBuffer()}
                else
                {
                    throw new Error("下载服务器xml文件失败:" + res.status);
                }
                ;
            });
        })
        //server xml
        .then((serverxml)=>{
            //写入本地
            let f = sys.fs.$open(_tmpfold + _entryfile,"w+");
            f.$write(serverxml);
            f.$close();
            return _serverxml(parsexml(serverxml));
        })
        //compare
        .then(_compare)
        //start
        .then((d)=>{start(_downlist.length,_dellist.length);return d;})
        //download
        .then((files)=>{
            console.log("download");
            let ncount = _downlist.length;
            let iserr = false;
            let errfile;
            let findex = 0;

            files.downlist.forEach((f)=>{
                fetch(_download_path + f,{
                    cache:"no-cache",
                    downloadProgress:(loaded,total)=>{
                        pone(f,loaded/1024,parseInt(total/1024));
                    }
                })
                .then((res)=>{
                    if(!res.ok){errfile=f;iserr = true;}
                    else{
                    findex++;
                    pall(findex,ncount);
                    let buff = res.arrayBuffer();      
                    let wf = sys.fs.$open(_tmpfold + f,"w+");
                    wf.$write(buff);
                    wf.$close();
                    } 
                })
                .catch((error)=>{
                    errfile = f;
                    iserr = true;
                });
            });           
            //阻塞
            let promise = new Promise((resolve,reject)=>{
                setInterval(() => {
                    if(iserr){reject(new Error(errfile+"下载失败"));throw new Error(errfile+"文件下载失败")};
                    if(ncount==findex){resolve()}
                }, 500);
            })
            return promise;
        })
        .then(()=>{
            return _copyfile();
        })
        //delete
        .then(()=>{
             return _cleartmp();
        })
        //complete
        .then(()=>{complete(_entrypoint)})
        .catch((e)=>{_cleartmp();error(e,_entrypoint)});
    }

    async function _cleartmp()
    {
        let filelist = sys.fs.$readdir(_tmpfold);
        let ncount = filelist.length;
        if (ncount==0){sys.fs.rmdir(_tmpfold);}
        filelist.forEach((file)=>{
            sys.fs.unlink(_tmpfold + file.name).then(()=>{
                ncount --;
                if (ncount==0){return sys.fs.rmdir(_tmpfold);}
            }).catch((e)=>{console.log("清空临时文件错误" + e)});
        });
    }

    function _copyfile()
    {
        console.log("copyfile");
        let n = 0;
        let ncount = _downlist.length;
        let iserr = false;
        let errfile;
        _downlist.forEach((f)=>{
            sys.fs.copyfile(_tmpfold + f,env.home()+"/"+f).then(()=>{n++}).catch(()=>{errfile=f;iserr=true;});
        });

        let promise  = new Promise((resolve,reject)=>{
            setInterval(() => {
                if(n==ncount){resolve()};
                if(iserr){reject(new Error("复制文件出错："+f))}
            }, 200);
        });

        //updatelist.xml
        sys.fs.copyfile(_tmpfold+_entryfile,env.home()+"/"+_entryfile)
        .catch((e)=>{console.log("复制xml文件出错" + e)});
        
        return promise;
    }

    function _compare()
    {
        if (_version_l >= _version_s){throw new Error("没有可用更新")}
        _downlist = _xmldoc_s.$$("Files File").filter((item)=>{
            let file = item.getAttribute("name");
            let filev = item.getAttribute("Ver");
            let lele = _xmldoc_l.$("Files File[Name='" + file + "']");
            if(lele==null || lele.getAttribute("Ver")<filev)
            {
            return true;
            }
        }).map((item)=>{return item.getAttribute("name")})
        _dellist = _xmldoc_s.$$("DeleteFiles File").map((item)=>{
            return item.getAttribute("name");
        });
        return {downlist:_downlist,dellist:_dellist};     
    }

    const _localxml = function(xml)
    {
        try{
        _xmldoc_l = xml;
        _version_l = xml.getElementsByTagName("version")[0].innerHTML;
        _xmlurl    = xml.getElementsByTagName("url")[0].innerHTML;
        _entrypoint = xml.getElementsByTagName("EntryPoint")[0].innerHTML;
        sys.spawn(["taskkill","/f","/im",_entrypoint]);
        }catch(e){
           throw new Error("本地xml文件格式错误" + e);
       }
       return xml;
    }

    const _serverxml = function(xml)
    {
        try
        {
        _xmldoc_s = xml;
        _version_s = xml.getElementsByTagName("version")[0].innerHTML;
        _download_path = xml.getElementsByTagName("downloadurl")[0].innerHTML;
        _entrypoint = xml.getElementsByTagName("EntryPoint")[0].innerHTML;
        }catch(e)
        {
            throw new Error("服务器xml文件格式错误"+e);
        }
        return xml;
    }


    return {doit:doit};
}();
